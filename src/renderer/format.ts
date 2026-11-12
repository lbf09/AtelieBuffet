import type {Value} from '../shared/models';

export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export const money = (value: unknown): string => Number(value || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
export const dateTime = (value: unknown): string => {
  const text=String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return '—';
  return `${text.slice(8,10)}/${text.slice(5,7)}/${text.slice(0,4)}${text.length>10?' às '+text.slice(11,16):''}`;
};
const labels:Record<string,string> = {
  aniversario:'Aniversário',casamento:'Casamento',corporativo:'Corporativo',fechado:'Coberto',aberto:'Ao ar livre',
  rascunho:'Rascunho',orcamento_enviado:'Orçamento enviado',confirmado:'Confirmado',concluido:'Concluído',cancelado:'Cancelado',
  enviado:'Enviado',aprovado:'Aprovado',recusado:'Recusado',expirado:'Expirado',ativo:'Ativo',inativo:'Inativo',previsto:'Previsto',
  administrador:'Administrador',atendimento:'Atendimento',operacoes:'Operações',unidade:'Unidade',porcao:'Porção',kg:'Kg',litro:'Litro',pessoa:'Pessoa',
  manual:'Manual',openrouteservice:'openrouteservice',orcamento:'Orçamento',confirmacao:'Confirmação',
  simulado:'Simulado',aceito_provedor:'Aceito pelo provedor',pendente:'Pendente',falhou:'Envio rejeitado',resultado_incerto:'Resultado incerto'
};
export const label = (value: unknown): string => labels[String(value)] || String(value ?? '—');
export const badge = (value: Value): string => `<span class="status status-${escapeHtml(value)}">${escapeHtml(label(value))}</span>`;
export const icon = (name: string): string => {
  const paths:Record<string,string>={
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
    menu:'<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M19 3c-4 3-4 8 0 10v8m0-18v10"/>',
    box:'<path d="m3 7 9-4 9 4v11l-9 4-9-4Zm0 0 9 4 9-4M12 11v11M7 5l10 4"/>',
    quote:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h2m2 3h2"/>',
    link:'<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-5-5l-2 2"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    logout:'<path d="M10 3H4v18h6m3-14 5 5-5 5m-6-5h14"/>',
    check:'<path d="m5 12 4 4L19 6"/>'
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.link}</svg>`;
};
