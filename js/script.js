const pokemonName = document.querySelector('.pokemon_name'); /* Seleciona o elemento com a classe 'pokemon_name' e atribui a variável */
const pokemonNumber = document.querySelector('.pokemon_number'); /* Seleciona o elemento com a classe 'pokemon_number' e atribui a variável */
const pokemonImage = document.querySelector('.pokemon_image'); /* Seleciona o elemento com a classe 'pokemon_image' e atribui a variável */

const form = document.querySelector('.form'); /* Seleciona o elemento com a classe 'form' e atribui a variável */
const input = document.querySelector('.input_search'); /* Seleciona o elemento com a classe 'input_search' e atribui a variável */
const buttonPrev = document.querySelector('.btn-prev'); /* Seleciona o elemento com a classe 'btn-prev' e atribui a variável */
const buttonNext = document.querySelector('.btn-next'); /* Seleciona o elemento com a classe 'btn-next' e atribui a variável */

let searchPokemon = 1; /* Inicializa a variável 'searchPokemon' com o valor 1 */

const fetchPokemon = async (pokemon) => { /* Define uma função assíncrona chamada 'fetchPokemon' que recebe um parâmetro 'pokemon' */
  const APIResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemon}`); /* Faz uma solicitação à API da Pokédex usando o nome ou número do Pokémon fornecido */

  if (APIResponse.status === 200) { /* Verifica se a resposta da API foi bem-sucedida (código de status 200) */
    const data = await APIResponse.json(); /* Converte a resposta em formato JSON e atribui a variável 'data' */
    return data; /* Retorna os dados do Pokémon */
  }
}

const renderPokemon = async (pokemon) => { /* Define uma função assíncrona chamada 'renderPokemon' que recebe um parâmetro 'pokemon' */
  pokemonName.innerHTML = 'Loading...'; /* Define o texto "Loading..." para o nome do Pokémon */
  pokemonNumber.innerHTML = ''; /* Limpa o número do Pokémon */

  const data = await fetchPokemon(pokemon); /* Chama a função 'fetchPokemon' para obter os dados do Pokémon */

  if (data) { /* Verifica se os dados do Pokémon foram obtidos com sucesso */
    pokemonImage.style.display = 'block'; /* Exibe a imagem do Pokémon */
    pokemonName.innerHTML = data.name; /* Define o nome do Pokémon com base nos dados */
    pokemonNumber.innerHTML = data.id; /* Define o número do Pokémon com base nos dados */
    pokemonImage.src = data['sprites']['versions']['generation-v']['black-white']['animated']['front_default']; /* Define a fonte da imagem com base nos dados */
    input.value = ''; /* Limpa o valor da caixa de pesquisa */
    searchPokemon = data.id; /* Atualiza o número do Pokémon pesquisado */
  } else {
    pokemonImage.style.display = 'none'; /* Oculta a imagem do Pokémon */
    pokemonName.innerHTML = 'Not found :c'; /* Define o texto "Not found :c" para o nome do Pokémon */
    pokemonNumber.innerHTML = ''; /* Limpa o número do Pokémon */
  }
}

form.addEventListener('submit', (event) => { /* Adiciona um ouvinte de evento para o envio do formulário */
  event.preventDefault(); /* Impede o envio padrão do formulário */
  renderPokemon(input.value.toLowerCase()); /* Chama a função 'renderPokemon' com o valor da caixa de pesquisa em letras minúsculas */
});

buttonPrev.addEventListener('click', () => { /* Adiciona um ouvinte de evento para o clique no botão "Prev" */
  if (searchPokemon > 1) { /* Verifica se o número do Pokémon pesquisado é maior que 1 */
    searchPokemon -= 1; /* Reduz o número do Pokémon em 1 */
    renderPokemon(searchPokemon); /* Chama a função 'renderPokemon' com o novo número do Pokémon */
  }
});

buttonNext.addEventListener('click', () => { /* Adiciona um ouvinte de evento para o clique no botão "Next" */
  searchPokemon += 1; /* Aumenta o número do Pokémon em 1 */
  renderPokemon(searchPokemon); /* Chama a função 'renderPokemon' com o novo número do Pokémon */
});

renderPokemon(searchPokemon); /* Chama a função 'renderPokemon' inicialmente com o número do Pokémon 1 */
