# Diagnóstico: Problema de Reprodução de Áudio no MusicLab-IA

## Data
17 de março de 2026

## Ambiente
- **Frontend**: Netlify (https://musi-lab.netlify.app)
- **CDN de Áudio**: Cloudflare R2 (https://pub-16f1d7c21e584d2e81313d652073c029.r2.dev)
- **Formato dos arquivos**: M4A (AAC) convertidos via Swift/AVFoundation

## Problema

O player de áudio está carregando e "tocando" (a linha de progresso avança, o visualizador de ondas funciona), mas **não há saída de som**.

### Comportamento Observado
- ✅ O catálogo carrega corretamente
- ✅ A faixa é carregada (evento `loadedmetadata` dispara)
- ✅ O player inicia a reprodução (evento `play` dispara)
- ✅ A linha de tempo avança normalmente
- ✅ O visualizador de ondas responde
- ❌ **Nenhum som é emitido**

### Testes Realizados
1. O computador reproduz som em outros players (testado e funcionando)
2. O mute não está ativado
3. O volume está configurado corretamente (0.85)
4. O áudio carrega sem erros de CORS
5. O áudio carrega sem erros de rede (HTTP 200)

---

## Hipótese Principal

### O Cloudflare R2 está servindo os arquivos com Content-Type incorreto

**Content-Type atual retornado pelo R2:**
```
audio/mp4a-latm
```

**Content-Type esperado/recomendado:**
```
audio/mp4
```
ou
```
audio/aac
```

### Evidências

1. **Verificação via curl:**
```bash
$ curl -I "https://pub-16f1d7c21e584d2e81313d652073c029.r2.dev/alma-dele.m4a"
HTTP/1.1 200 OK
Content-Type: audio/mp4a-latm  ← PROBLEMA
```

2. **O arquivo é válido:**
```bash
$ file alma-dele.m4a
ISO Media, Apple iTunes ALAC/AAC-LC (.M4A) Audio
```

3. **Comportamento do navegador:**
   - O navegador aceita o arquivo (não gera erro)
   - O elemento `<audio>` dispara eventos de reprodução
   - Mas o decoder de áudio pode não estar processando corretamente devido ao MIME type não padronizado

### Por que `audio/mp4a-latm` causa problema?

- `audio/mp4a-latm` é um MIME type legado/não padronizado
- A especificação RFC 6381 recomenda `audio/mp4` para contêineres MP4 com áudio AAC
- Alguns navegadores podem não reconhecer `audio/mp4a-latm` como um formato de áudio válido para decodificação
- Isso explica por que o áudio "toca" (o navegador tenta) mas não há som (o decoder falha silenciosamente)

---

## Soluções Propostas

### Opção 1: Corrigir Content-Type no Cloudflare R2 (Recomendada)

Configurar o Content-Type correto para todos os arquivos `.m4a` no bucket R2:

**Via Dashboard do Cloudflare:**
1. Acesse https://dash.cloudflare.com
2. Navegue até R2 → Buckets → "musica"
3. Selecione os arquivos `.m4a`
4. Edite os metadados e defina `Content-Type: audio/mp4`

**Via API/Wrangler:**
```bash
# Para cada arquivo
wrangler r2 object put musica/alma-dele.m4a --file=alma-dele.m4a --content-type="audio/mp4"
```

**Via script (bulk update):**
```bash
#!/bin/bash
for file in web-audio/*.m4a; do
  filename=$(basename "$file")
  aws s3 cp "$file" "s3://musica/$filename" \
    --endpoint-url=https://772f4847778a206556d947f5cddcdd6c.r2.cloudflarestorage.com \
    --content-type="audio/mp4" \
    --metadata-directive REPLACE
done
```

### Opção 2: Modificar o Script de Conversão

Alterar o script `tools/convert_audio.swift` para gerar arquivos MP3 em vez de M4A:

```swift
// Alterar de:
exportSession.outputFileType = .m4a

// Para:
exportSession.outputFileType = .mp3
// ou
exportSession.outputFileType = .appleM4A // com configuração específica
```

**Vantagens:**
- MP3 tem suporte universal em todos os navegadores
- Content-Type `audio/mpeg` é bem estabelecido

**Desvantagens:**
- Requer reconversão de todas as 62 faixas
- Upload novamente para o R2

### Opção 3: Configurar Transform Rules no Cloudflare

Adicionar uma regra de transformação para sobrescrever o Content-Type:

1. Acesse Cloudflare Dashboard → Rules → Transform Rules
2. Crie uma regra "Modify Response Header"
3. Condição: URL contém `.m4a`
4. Ação: Set header `Content-Type` to `audio/mp4`

---

## Testes de Validação

Após aplicar a correção, verificar:

```bash
# Verificar Content-Type correto
curl -I "https://pub-16f1d7c21e584d2e81313d652073c029.r2.dev/alma-dele.m4a" | grep "content-type"
# Deve retornar: audio/mp4

# Testar reprodução no navegador
# 1. Abrir https://musi-lab.netlify.app
# 2. Clicar em "Tocar agora"
# 3. Verificar se o som é emitido
```

---

## Referências

- [RFC 6381 - The 'Codecs' and 'Profiles' Parameters for "Bucket" Media Types](https://tools.ietf.org/html/rfc6381)
- [MDN - Media formats for web](https://developer.mozilla.org/en-US/docs/Web/Media/Formats)
- [Cloudflare R2 - Custom metadata](https://developers.cloudflare.com/r2/objects/metadata/)

---

## Histórico de Debug

| Data | Ação | Resultado |
|------|------|-----------|
| 17/03 | Removido `crossorigin="anonymous"` do elemento audio | CORS resolvido, áudio carrega |
| 17/03 | Adicionado `<source>` element com `type="audio/mp4"` | Não resolveu |
| 17/03 | Alterado para `type="audio/aac"` | Testando |
| 17/03 | Identificado Content-Type incorreto no R2 | Hipótese principal |

---

## Próximos Passos

1. **Aplicar correção de Content-Type no R2** (Opção 1 recomendada)
2. Testar reprodução no navegador
3. Se funcionar, remover logs de debug do `app.js`
4. Se não funcionar, investigar conversão para MP3 (Opção 2)
