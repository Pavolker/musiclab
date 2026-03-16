# MusicLab-IA

Player web estatico para o acervo do projeto MusicLab-IA.

## Estrutura

- `index.html`: interface principal
- `styles.css`: identidade visual
- `app.js`: player, busca, filtros e visualizador
- `config.js`: configuracao da base de audio
- `conversion-report.json`: catalogo de faixas convertidas
- `tools/convert_audio.swift`: conversao local para `.m4a`

## Deploy

O app deve ser publicado no Netlify.

Os audios nao devem ir para o GitHub. Eles devem ficar no bucket R2 `musica`.

Antes do deploy final, ajuste `audioBaseUrl` em `config.js` para a URL publica do bucket R2.

## GitHub

Repositorio remoto esperado:

`https://github.com/Pavolker/musiclab.git`
