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
3. **openrouteservice.** No cadastro de um evento fora de Limeira, preencha o endereço, clique em **Localizar coordenadas**, escolha o resultado correto e salve. Abra **Orçamentos**, selecione esse evento e clique em **Consultar distância**. Confira a distância e a duração estimadas por trecho e o preenchimento da distância. Informe a tarifa por km e salve. O orçamento usa dois percursos e mantém a taxa base já prevista no formulário. Para um evento em Limeira (SP), confira a isenção do frete. Se a geocodificação do número da sede não estiver disponível, o openrouteservice pode localizar o logradouro pelo CEP.
4. **Resend.** Cadastre um cliente com um endereço de teste que você controla. Crie um evento e um orçamento válido com itens. Abra a proposta e clique em **Prévia do orçamento**. Revise e clique em **Confirmar envio**. No histórico, confira o estado **Aceito pelo provedor** e o ID da mensagem. Depois, aprove o orçamento, confirme o evento e use **Prévia da confirmação** para repetir o fluxo. Confira a caixa de teste ou o painel do Resend para verificar a entrega. Cada versão permite um envio aceito por tipo. Em caso de resultado incerto, consulte o painel do Resend antes de tomar qualquer ação. O aplicativo bloqueia a repetição de uma tentativa pendente ou incerta.

## Verificações locais

```powershell
npm run typecheck
npm test
npm run build
```

Os testes interceptam as chamadas HTTP. Eles não consomem cotas nem enviam mensagens. A demonstração e o modo real usam o mesmo conjunto de canais IPC, e as credenciais são usadas apenas no processo principal.

Provedores: [ViaCEP](https://viacep.com.br/), [Open-Meteo](https://open-meteo.com/en/docs), [openrouteservice](https://openrouteservice.org/dev/#/api-docs), [Resend](https://resend.com/docs/api-reference/emails/send-email). Endereço da sede: [COTIL](https://www.cotil.unicamp.br/contato/).
