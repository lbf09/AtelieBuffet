# Ateliê Buffet

Aplicativo desktop para gestão de buffet.

## Executar no Windows

Instale Node.js 24 ou superior. Na pasta do projeto, execute:

```powershell
npm ci
Copy-Item .env.example .env
notepad .env
npm start
```

O `npm start` compila o projeto e inicia o Electron. O banco padrão é SQLite local. O login inicial de um banco novo é **buffet**, com senha **atelie123**. Use sua conta habitual se já houver um banco configurado.

### Configuração das integrações

| Variável | Valor |
|---|---|
| `API_MODE` | `live` para chamar os provedores. Se ausente ou diferente de `live`, usa demonstração. |
| `OPENROUTESERVICE_API_KEY` | Chave autorizada para geocodificação e rotas. |
| `BUFFET_ORIGIN_CEP` | `13484332`, CEP de referência da sede no COTIL. O número 1888 consta no endereço oficial. |
| `RESEND_API_KEY` | Chave com permissão de envio no Resend. |
| `RESEND_FROM_EMAIL` | Remetente autorizado, como `buffet@seudominio.com.br` ou `"Ateliê Buffet <buffet@seudominio.com.br>"`. Use um domínio verificado quando exigido pelo Resend. |

ViaCEP e Open-Meteo dispensam chave nesta configuração. Aplique as condições de uso e cotas dos provedores ao ambiente em que executar o aplicativo. O arquivo `.env` é carregado na execução de desenvolvimento e deve ficar fora do Git e do pacote. Reinicie o Electron após editar a configuração.

Para testar a demonstração, use `npm run demo`. Esse comando força a simulação e usa SQLite. Para uma instalação que já usa MySQL, mantenha sua configuração local `DB_MODE=mysql` e execute `npm run db:migrate` ao configurar o banco. O modo das APIs é independente do banco.

### Teste manual em modo real

1. **ViaCEP.** Abra **Eventos**, crie ou edite um evento e informe `01001-000`. Clique em **Consultar CEP**. Confira a Praça da Sé e a cidade de São Paulo. Revise os campos preenchidos, complete o número e confirme que os campos continuam editáveis. Repita com `99999-999` para verificar a mensagem de CEP inexistente.
2. **Open-Meteo.** Cadastre um evento para hoje ou para os próximos 15 dias, com latitude e longitude válidas. Abra seus detalhes. A previsão é consultada automaticamente e pode ser consultada de novo pelo botão **Consultar previsão**. Confira a data, a temperatura mínima e máxima, a probabilidade de chuva e a precipitação em milímetros. Um evento ao ar livre mostra o alerta interno quando a probabilidade supera 50%. Com uma data mais distante, confira o aviso de indisponibilidade. Os horários cadastrados seguem o horário de São Paulo.
3. **openrouteservice.** No cadastro de um evento fora de Limeira, preencha o endereço, clique em **Localizar coordenadas**, escolha o resultado correto e salve. Abra **Orçamentos**, selecione esse evento e clique em **Consultar distância**. Confira a distância e a duração estimadas por trecho e o preenchimento da distância. Informe a tarifa por km e salve. O frete usa a distância × tarifa × 2 percursos, sem taxa base. Para um evento em Limeira (SP), confira a isenção do frete. Se a geocodificação do número da sede não estiver disponível, o openrouteservice pode localizar o logradouro pelo CEP.

## Cobrança comercial

- **Faixas de preço** (`Catálogo › Faixas de preço`): cada cardápio tem faixas de convidados com preço por adulto. A faixa é escolhida pelo **total de convidados (adultos + crianças)**. O mínimo faturado da faixa permite cobrar um número mínimo de adultos.
- **Faixas de idade** (`Catálogo › Faixas de idade`): o padrão da demonstração é 0 a 5 anos grátis e 6 a 10 anos com 50% do valor do adulto. Crianças de 11 anos ou mais entram na contagem de adultos. Percentuais e faixas podem ser editados por administradores.
- **Cardápio do evento**: ao escolher o cardápio no evento, as quantidades de `event_menu_items` são geradas a partir da composição × total de convidados. Abra os detalhes do evento e use **Aplicar cardápio** para recalcular; ajustes manuais ficam disponíveis em `Quantidades do cardápio`.
- **Orçamento**: pacote do cardápio (adultos e crianças), itens avulsos, serviços de fornecedores, custos de equipe, frete, outros serviços e desconto formam a receita. O imposto é calculado pela alíquota do orçamento (6% por padrão) e **somado ao total do cliente**. A margem interna é receita − custos − imposto e não aparece na mensagem enviada.
- **Sinal e parcelas**: o sinal é um percentual do total (30% por padrão) e é gerado ao aprovar o orçamento. O evento só pode ser **confirmado** depois de um orçamento aprovado e do sinal pago em `Parcelas e sinal`. Use **Gerar parcelas** nos detalhes do evento para dividir o restante; parcelas pagas são preservadas.
- **Alterações e histórico**: editar um orçamento enviado ou aprovado é permitido e grava o antes/depois em `change_history`, consultável em **Histórico de alterações** na proposta.
- **Cancelamento**: use **Cancelar evento** nos detalhes do evento. A política padrão aplica 10% de multa com 30 dias ou mais, 30% com 15 dias ou mais, 50% com 7 dias ou mais e 100% abaixo disso, sempre sobre o valor pago. Multa e reembolso podem ser ajustados manualmente no diálogo.
- **Arquivamento**: eventos e orçamentos concluídos, cancelados, enviados ou aprovados não são excluídos. Use **Arquivar** para retirá-los do painel preservando o histórico.
- **Permissões**: administrador gerencia tudo; atendimento cuida de clientes, eventos, orçamentos, financeiro e cancelamentos; operações cuida da agenda, cardápios, fornecedores e escalas. A equipe e os usuários são administrados apenas por administradores. O menu **Dados técnicos** mostra migrações e tentativas de e-mail somente para consulta do administrador.

### Atualização de bancos já existentes

A migração `002` adiciona a cobrança comercial sem apagar dados. Em MySQL, execute `npm run db:migrate` antes de abrir o aplicativo. No modo de demonstração, o SQLite local é migrado automaticamente e recebe a configuração comercial que faltar.
4. **Resend.** Cadastre um cliente com um endereço de teste que você controla. Crie um evento e um orçamento válido com itens. Abra a proposta e clique em **Prévia do orçamento**. Revise e clique em **Confirmar envio**. No histórico, confira o estado **Aceito pelo provedor** e o ID da mensagem. Depois, aprove o orçamento, confirme o evento e use **Prévia da confirmação** para repetir o fluxo. Confira a caixa de teste ou o painel do Resend para verificar a entrega. Cada versão permite um envio aceito por tipo. Em caso de resultado incerto, consulte o painel do Resend antes de tomar qualquer ação. O aplicativo bloqueia a repetição de uma tentativa pendente ou incerta.

## Verificações locais

```powershell
npm run typecheck
npm test
npm run build
```

Os testes interceptam as chamadas HTTP. Eles não consomem cotas nem enviam mensagens. A demonstração e o modo real usam o mesmo conjunto de canais IPC, e as credenciais são usadas apenas no processo principal.

Provedores: [ViaCEP](https://viacep.com.br/), [Open-Meteo](https://open-meteo.com/en/docs), [openrouteservice](https://openrouteservice.org/dev/#/api-docs), [Resend](https://resend.com/docs/api-reference/emails/send-email). Endereço da sede: [COTIL](https://www.cotil.unicamp.br/contato/).
