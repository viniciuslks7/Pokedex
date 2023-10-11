# Projeto Pokedex - Manual do Dev

Este projeto é uma aplicação web desenvolvida com base no tutorial do canal "Manual do Dev", que você pode acessar [aqui](https://www.youtube.com/watch?v=SjtdH3dWLa8). A Pokedex é uma enciclopédia virtual que permite explorar informações e imagens de diversos Pokémon.

## Tecnologias Utilizadas

O projeto é construído com as seguintes tecnologias:
- HTML
- CSS
- JavaScript
- API do Pokémon (pokeAPI)

## Como Usar

Para executar o código deste projeto de forma local, recomendo o uso da extensão "Live Server" no Visual Studio Code para obter uma visualização em tempo real. Simplesmente clique com o botão direito no arquivo HTML principal e selecione "Open with Live Server" para iniciar a aplicação.

### Imagens Animadas (GIF)

O código está configurado para buscar imagens animadas (GIF) até o ID do Pokémon 649. Se você deseja que a aplicação abranja Pokémon até o ID 898, utilize o seguinte código ao resgatar a imagem do Pokémon através da API:

```javascript
pokemonImage.src = data['sprites']['other']['home']['front_default'];
```

### Web Component Personalizado

Também é possível incorporar um web component criado por "MarketingPip" para a exibição da Pokedex. Você pode encontrar o repositório deste web component [aqui](https://github.com/MarketingPipeline/Pokedex-Web-Component). Este componente oferece uma forma fácil de adicionar a Pokedex ao seu site ou aplicação.
