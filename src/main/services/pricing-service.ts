import {Database} from '../database';
import {assert,cents} from '../../shared/validation';

export interface ChildCount {band_id:number;label:string;min_age:number;max_age:number;percent:number;quantity:number;}
export interface ChildLine extends ChildCount {unitPrice:number;amount:number;}
export interface PackagePrice {
  menuId:number;bandId:number|null;totalGuests:number;adults:number;children:number;
  legacyBandId?:number;legacyChildUnitPrice?:number;
  billableAdults:number;adultUnitPrice:number;adultAmount:number;childAmount:number;
  packageAmount:number;childLines:ChildLine[];
}

// Preço do pacote: a faixa é escolhida pelo total de convidados (adultos + crianças);
// crianças pagam um percentual do preço do adulto vigente na faixa.
export class PricingService {
  constructor(private db:Database) {}

  async childCounts(eventId:number):Promise<ChildCount[]> {
    const rows=await this.db.query(
      `SELECT cb.id AS band_id, cb.label, cb.min_age, cb.max_age, cb.percent, eg.quantity
       FROM event_guests eg JOIN child_bands cb ON cb.id = eg.child_band_id
       WHERE eg.event_id = ? AND eg.quantity > 0 ORDER BY cb.min_age`,
      [eventId]
    );
    return rows.map(row=>({
      band_id:Number(row.band_id),label:String(row.label),min_age:Number(row.min_age),
      max_age:Number(row.max_age),percent:Number(row.percent),quantity:Number(row.quantity)
    }));
  }

  async price(menuId:number|null,adults:number,children:ChildCount[],eventGuests:number):Promise<PackagePrice|null> {
    if(!menuId) return null;
    const bands=await this.db.query('SELECT * FROM price_bands WHERE menu_id = ? ORDER BY min_guests',[menuId]);
    if(!bands.length) return this.legacyPrice(menuId,adults,children,eventGuests);
    const totalGuests=adults+children.reduce((sum,child)=>sum+child.quantity,0);
    const band=bands.find(row=>totalGuests>=Number(row.min_guests)&&
      (row.max_guests===null||row.max_guests===undefined||row.max_guests===''||totalGuests<=Number(row.max_guests)));
    assert(band,`Nenhuma faixa de preço cobre ${totalGuests} convidado${totalGuests===1?'':'s'} neste cardápio.`);
    const adultUnitPrice=cents(String(band!.price_per_adult));
    const minimum=Number(band!.min_billing_guests||0);
    // Abaixo do mínimo faturado, a diferença é cobrada como unidades de adulto.
    const billableAdults=adults+Math.max(0,minimum-totalGuests);
    const adultAmount=billableAdults*adultUnitPrice;
    const childLines:ChildLine[]=children.map(child=>{
      const unitPrice=Math.round(adultUnitPrice*child.percent/100);
      return {...child,unitPrice,amount:unitPrice*child.quantity};
    });
    const childAmount=childLines.reduce((sum,line)=>sum+line.amount,0);
    return {
      menuId,bandId:Number(band!.id),totalGuests,adults,children:totalGuests-adults,
      billableAdults,adultUnitPrice,adultAmount,childAmount,
      packageAmount:adultAmount+childAmount,childLines
    };
  }

  private async legacyPrice(menuId:number,adults:number,children:ChildCount[],eventGuests:number):Promise<PackagePrice|null> {
    if(this.db.mode!=='mysql') return null;
    const legacyTable=await this.db.query("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='price_bands_legacy_004'");
    if(!legacyTable.length) return null;
    const bands=await this.db.query('SELECT id,min_adults,max_adults,price,child_price FROM price_bands_legacy_004 WHERE menu_id=? ORDER BY min_adults,id',[menuId]);
    if(!bands.length) return null;
    const band=bands.find(row=>adults>=Number(row.min_adults)&&adults<=Number(row.max_adults));
    assert(band,`Nenhuma faixa antiga de preço cobre ${adults} adultos neste cardápio. Revise a quantidade ou cadastre as faixas atuais.`);
    const adultUnitPrice=cents(band.price),childUnitPrice=cents(band.child_price);
    const childLines=children.map(child=>({...child,unitPrice:childUnitPrice,amount:child.quantity*childUnitPrice}));
    const childCount=childLines.length?children.reduce((sum,child)=>sum+child.quantity,0):Math.max(0,eventGuests-adults);
    const adultAmount=adults*adultUnitPrice,childAmount=childCount*childUnitPrice;
    return {
      menuId,bandId:null,legacyBandId:band.id,legacyChildUnitPrice:childUnitPrice,
      totalGuests:adults+childCount,adults,children:childCount,billableAdults:adults,
      adultUnitPrice,adultAmount,childAmount,packageAmount:adultAmount+childAmount,childLines
    };
  }
}
