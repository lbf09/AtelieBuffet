# Ateliê Buffet

Aplicativo desktop para gestão de buffet.

## Executar

Instale Node.js 24 ou superior. No terminal desta pasta:

```powershell
npm ci
npm start
```

Login inicial: **buffet**. Senha: **atelie123**. A conta é criada somente quando o banco estiver vazio; contas existentes são preservadas. A senha é armazenada com scrypt. Para um banco já configurado, use sua conta existente.

Por padrão, usa SQLite local. Para MySQL, copie .env.example para .env, configure DB_MODE=mysql e as credenciais do seu banco, execute npm run db:migrate e reinicie. Não publique arquivos .env.

As integrações usam respostas simuladas e nenhum e-mail é enviado.

Execute npm test para verificar as regras incluídas. Cada pasta pode ser instalada e executada de forma independente.
