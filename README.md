# Traço Studio

Aplicativo de animação estilo whiteboard. Importe imagens, prepare os traços para a animação e ajuste a pintura por cores.

## Executar localmente

Requisitos: Node.js 18 ou mais recente.

1. Abra um terminal nesta pasta.
2. Execute `npm start`.
3. Acesse http://localhost:4173 no navegador.

O app roda no navegador e não precisa de dependências npm adicionais.

## Arquivos principais

- `index.html`, `style.css`: interface
- `app.js`: estado e interação do aplicativo
- `uploads.js`: importação e preparação de imagens
- `trace-core.js`, `trace-worker.js`: análise e animação dos traços
- `color-core.js`, `color-render.js`: regiões e animação de cores

## Editar com outra IA

Abra esta pasta como projeto. As instruções e o código do app estão todos dentro dela. A pasta foi preparada como repositório Git independente.
