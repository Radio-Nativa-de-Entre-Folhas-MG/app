# Nativa FM 98.7 — GitHub Pages (V1.9.4)

PWA estática pronta para hospedar diretamente pelo GitHub Pages. O visual verde neon, a vitrine de instalação, o rádio ao vivo, o botão ligar/desligar, a reconexão, o equalizador e os dois botões originais do WhatsApp foram preservados. Os dois botões WhatsApp permanecem lado a lado, como na tela original. Abaixo deles há uma faixa compacta **COMPARTILHAR**, que abre o WhatsApp com uma mensagem de convite e um link para instalar o aplicativo.

## ALTERAÇÃO OBRIGATÓRIA ANTES DE DIVULGAR

Abra o arquivo **config.js** e troque somente o valor de `shareInstallUrl` pelo endereço verdadeiro onde a PWA estiver publicada, por exemplo:

```js
shareInstallUrl: 'https://seu-usuario.github.io/nativa-fm/'
```

**Não deixe o link SEU-USUARIO no projeto publicado.** O nome, a frequência e o slogan da Nativa FM são incluídos automaticamente no convite.

## PUBLICAÇÃO DIRETA NO GITHUB

1. Crie um repositório público no GitHub, por exemplo `nativa-fm`.
2. Envie **o conteúdo desta pasta** para a raiz do repositório (o `index.html` deve ficar na raiz, não dentro de outra pasta).
3. Abra **Settings > Pages** e selecione **Deploy from a branch**, `main`, `/(root)`, depois salve.
4. Acesse o endereço HTTPS informado pelo GitHub Pages para instalar. Em geral: `https://USUARIO.github.io/nativa-fm/`.
5. Atualize `shareInstallUrl` em `config.js` com o URL final, envie a alteração e teste COMPARTILHAR dentro do app instalado.

## OBSERVAÇÕES

- **Sem Node.js**: foram excluídos `server.js`, scripts locais, laudos e prévias desnecessárias ao site. A PWA consulta o streaming Zeno diretamente. Nessa modalidade, o áudio pode funcionar, mas o equalizador real pode ficar limitado pelas regras CORS do provedor de streaming. Não se inventa animação falsa para substituir leitura real do áudio.
- Navegadores só permitem autoplay conforme suas próprias políticas; em alguns dispositivos o primeiro toque pode ser exigido.
- A PWA normalmente mostra a página de instalação no navegador comum e a tela da rádio ao abrir **o ícone instalado**.
- O link de compartilhamento abre o WhatsApp (aplicativo ou site) conforme o sistema operacional e a configuração do navegador. A mensagem é preparada, mas o envio depende da confirmação do usuário.
- Para não exibir versão antiga, atualizamos as referências para **V1.9.4** e renovamos o cache do service worker.

## ARQUIVOS DO SITE

`index.html`, `styles.css`, `app.js`, `config.js`, `gate.js`, `landing.js`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, `assets/`, `icons/`. Este README é apenas documentação e não precisa ser enviado ao GitHub se quiser manter a pasta estritamente mínima.

## NOTA SOBRE A PRÉVIA

A prévia da versão 1.9.4 deve ser feita com a tela real da Nativa FM, mantendo o logo e o equalizador de seis cores. O botão COMPARTILHAR é um botão próprio entre os contatos e o botão vermelho de desligar.


## Atualização visual V1.9.4

A linha inferior contém **dois botões lado a lado**: à **esquerda**, ligar/desligar somente com o ícone universal (vermelho durante a reprodução, verde ao desligar); à **direita**, **COMPARTILHAR** com ícone, abrindo o WhatsApp com convite para instalar. A voz/som, streaming, equalizador, metadados, instalação PWA e botões de pedir música e anunciar não foram alterados nesta atualização.

A URL de compartilhamento deve ser editada em `config.js`, propriedade `shareInstallUrl`, antes da publicação. Publique os arquivos **dentro** da pasta do ZIP na raiz do repositório, não a pasta contêiner. Para atualizar uma versão já instalada, abra o app com internet para carregar o novo service worker; caso a versão anterior permaneça em cache, feche e reabra o aplicativo.
