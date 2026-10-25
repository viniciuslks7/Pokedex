# Pokédex

Uma Pokédex em HTML, CSS e JavaScript, inspirada no tutorial do [Manual do Dev](https://www.youtube.com/watch?v=SjtdH3dWLa8), com dados da [PokéAPI](https://pokeapi.co/).

## Executar

Sem dependências ou etapa de build. Na raiz do projeto:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra a página servida na porta 8000 no seu navegador. Também é possível usar a extensão Live Server do VS Code. A consulta aos dados precisa de acesso a `pokeapi.co`; as imagens e os sons são carregados de `raw.githubusercontent.com`. As ilustrações dos cenários estão em `images/habitats` e não exigem serviços externos.

## Publicar o site

O fluxo `.github/workflows/pages.yml` usa Node.js 24 na validação e nas ações de publicação, valida as regras e prepara o site em cada alteração enviada para `main`. Em pull requests, executa a validação sem publicar. Para habilitar a publicação, abra **Settings → Pages** no repositório e escolha **GitHub Actions** em **Source**. Depois envie as alterações para `main` ou execute **Actions → Publish Pokédex → Run workflow**. A publicação usa as permissões temporárias do próprio GitHub, sem chaves adicionais.

O endereço padrão deste repositório é `https://viniciuslks7.github.io/Pokedex/`, disponível depois que o trabalho de publicação terminar com sucesso. A interface usa caminhos relativos, incluindo o manifesto e o service worker. Ao atualizar, quem já usa o aplicativo pode receber a opção “Atualizar aplicativo”.

Para preparar a mesma versão localmente, sem instalar dependências:

```sh
node scripts/build-site.cjs
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

O comando recria `dist/` e atualiza a revisão offline com base nos arquivos atuais. Publique **o conteúdo de `dist/`** em qualquer hospedagem estática com HTTPS. Essa pasta inclui somente HTML, CSS, módulos, ilustrações, ícones, manifesto e arquivos do service worker. Testes, scripts, prévias, dados locais de demonstração e caches de desenvolvimento ficam de fora. O comando não exporta favoritos, equipes ou anotações pessoais do navegador.

Com a coleção de testes já baixada, também é possível validar o pacote real com o service worker em um subdiretório:

```sh
POKEDEX_SITE_DIR=dist node tests/pwa.cjs
```

## Prévia em arquivo único

Se a visualização abrir apenas o `index.html` e mostrar a página sem estilos ou presa em “Preparando sua Pokédex…”, use `preview.html`. Esse arquivo incorpora CSS, JavaScript e cenários; pode ser aberto diretamente no navegador, sem servidor. Os dados, sprites e sons ainda precisam de acesso à Internet. Publicar o ambiente não é necessário para gerá-lo.

Para gerar ou atualizar a prévia depois de alterar o projeto:

```sh
npm install --prefix /tmp/pokedex-preview-tools --no-audit --no-fund esbuild@0.25.12
NODE_PATH=/tmp/pokedex-preview-tools/node_modules node scripts/export-preview.cjs
```

O `preview.html` gerado é ignorado pelo Git. Os arquivos de desenvolvimento continuam separados; gere a prévia novamente após novas mudanças. A execução de JavaScript e o acesso à PokéAPI também dependem das permissões do visualizador. Em visualizações com armazenamento bloqueado, os favoritos e a equipe funcionam durante a sessão.

### Prévia sem acesso à Internet

Para visualizadores que bloqueiam a conexão com a PokéAPI, há uma edição separada: `preview-offline.html`. Ela incorpora dados reais de uma seleção de **43 Pokémon e 44 formas alternativas**, incluindo suas famílias evolutivas, imagens normais e shiny, sons e relações entre tipos. Um aviso identifica a coleção offline e a data dos dados. A busca, a navegação aleatória e os filtros ficam limitados a essa coleção; a versão online mantém o catálogo completo.

Para reproduzir essa edição, com acesso aos domínios já usados pelo projeto:

```sh
node scripts/cache-preview-data.cjs
NODE_PATH=/tmp/pokedex-preview-tools/node_modules node scripts/export-preview.cjs --offline
```

O download usa `curl`, preservando proxy e verificação TLS, e confirma os formatos das imagens e dos sons. Os recursos públicos ficam em `.preview-cache/`, e a seleção em `.preview-data.json`; ambos são ignorados pelo Git. Use `node scripts/cache-preview-data.cjs --refresh` para buscar novamente os dados na API. Depois gere o HTML outra vez. A geração da prévia comum continua disponível sem `--offline`.

O teste abaixo bloqueia toda a rede, percorre os 43 Pokémon da coleção, verifica busca, evoluções, afinidades, filtros, imagens, shiny, áudio e interação, e exige zero requisições externas:

```sh
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/offline-preview.cjs
```

## Recursos

- Interface responsiva em português com cenários ilustrados locais que acompanham o tipo do Pokémon.
- Menu de seções com onze atalhos, indicação da posição na página, retorno à busca, navegação por teclado/toque e link para pular ao conteúdo.
- Temas Claro, Escuro e Sistema, com preferência salva neste navegador e acompanhamento automático da aparência do sistema.
- Seis cenários: floresta, litoral, vale vulcânico, tempestade, bosque lunar e picos nevados, com modo noturno.
- Interação por clique ou toque no Pokémon, efeitos que podem ser pausados e avisos ao favoritar ou ativar shiny.
- Som do Pokémon, quando fornecido pela API, reproduzido apenas ao clicar em “Ouvir”.
- Sugestões rápidas de busca e atalhos: `/` para buscar e `←` / `→` para navegar fora dos campos de edição.
- Busca por nome ou número, navegação anterior/próximo e descoberta aleatória.
- Sugestões enquanto digita, com seleção por toque, mouse ou setas e Enter; Escape fecha a lista.
- Seletor de formas regionais, Mega Evoluções e outras variedades registradas na espécie, com tipos, atributos e imagens próprios.
- Tipos, altura, peso, habilidades e os seis atributos base.
- Diário de campo com descrição, categoria, geração, habitat e índice base de captura, além da identificação de Pokémon bebês, lendários e míticos.
- Equipe de até seis Pokémon salva neste navegador, com análise das fraquezas compartilhadas por pelo menos dois integrantes.
- Biblioteca de até 20 equipes nomeadas: salvar cópias, carregar, atualizar, renomear, excluir e desfazer a última exclusão durante a sessão.
- Compartilhamento da equipe por link ou código, com prévia dos integrantes antes da importação.
- Comparação de dois Pokémon pelos seis atributos base e pelo total, tipos, habilidades (incluindo ocultas) e multiplicadores de dano recebido dos 18 tipos de ataque.
- Backup em arquivo JSON dos favoritos, progresso, anotações, equipe atual e equipes nomeadas, com prévia, mesclagem, substituição e opção de desfazer a última importação.
- Diário de campo com notas de até 500 caracteres por espécie, salvamento automático, busca por nome/texto e exclusão com desfazer.
- Registro manual de espécies vistas e capturadas, com filtros, indicadores e progresso por seleção, compartilhado entre formas alternativas da mesma espécie.
- Aplicativo instalável com manifesto e service worker, abertura offline, lista de Pokémon guardados e atualização pelo navegador.
- Exportação da equipe em PNG de 1.200 × 1.080 pixels, com título editável, retratos, nomes, números da Pokédex e tipos.
- Sugestões explicadas de parceiros para cobrir ameaças defensivas e mapa de dano recebido pelos 18 tipos para cada integrante.
- Cobertura ofensiva com até quatro tipos de ataque, melhor opção contra os 18 tipos isolados e multiplicadores contra o Pokémon aberto, respeitando seus tipos duplos.
- Histórico dos 12 últimos Pokémon abertos, com pausa, limpeza e desfazer; até oito buscas nomeadas com combinações de filtros para aplicar novamente.
- Favoritos salvos neste navegador, com visualização exclusiva da sua coleção.
- Catálogo paginado com filtros combinados por tipo e geração, inclusive nos favoritos.
- Filtros avançados por categoria (lendários, míticos ou bebês), habitat e faixa de atributos base, com ordenação por nome, número ou atributo.
- Linha evolutiva com ramificações, condições de evolução e acesso aos detalhes de cada membro da família.
- Requisitos de nível, itens, amizade, horário, troca e condições especiais, com alternativas identificadas por jogo.
- Fraquezas, resistências e imunidades calculadas a partir dos tipos atuais, incluindo multiplicadores ×4 e ×0,25 para tipos duplos.
- Alternância entre sprites normais e shiny, com imagens alternativas quando a animação não está disponível.
- Cache em memória, cancelamento de buscas anteriores, limite de tempo e opção de tentar novamente em caso de falha.
- Rótulos acessíveis, mensagens anunciadas por leitores de tela, foco visível e respeito à preferência por movimento reduzido.

Os nomes e as habilidades são exibidos como fornecidos pela PokéAPI. O catálogo é consultado para determinar a quantidade de espécies; se essa consulta falhar, o limite para navegação e sorteio é 1.025. A busca direta continua disponível. Os cenários são ambientações visuais inspiradas no tipo principal, não registros dos habitats oficiais. O modo noturno é uma escolha visual, independente do horário. A preferência por movimento reduzido é respeitada e os efeitos também podem ser pausados pelo botão “Efeitos”.

## Instalar e consultar sem conexão

Sirva o projeto em HTTPS (ou em `localhost` durante o desenvolvimento). A interface prepara os arquivos do aplicativo e guarda consultas públicas da PokéAPI, retratos normais/shiny e sons. O painel “Sua Pokédex, sempre por perto” informa quando o aplicativo está pronto e lista os Pokémon efetivamente guardados. Use “Instalar aplicativo” quando o navegador oferecer essa opção, ou procure “Instalar”/“Adicionar à tela de início” no menu do navegador. A instalação depende do suporte do navegador; publicar o ambiente de desenvolvimento não publica o site.

Depois de consultar um Pokémon, aguarde ele aparecer em “Pokémon guardados”. É possível fechar a página e abri-la novamente sem Internet. A busca por nome ou número usa os dados guardados; uma consulta não armazenada recebe uma mensagem própria. Recursos da API ainda não consultados precisam de conexão. Os limites são de 300 entradas de API e 300 mídias, com remoção das mais antigas, sujeitos ao espaço disponibilizado pelo navegador. Dados públicos offline são separados dos favoritos e equipes: “Apagar Pokémon guardados offline” limpa somente as consultas e mídias, preservando as coleções pessoais e os arquivos do aplicativo.

`sw.js` e `offline-assets.js` usam o diretório do site como escopo, permitindo hospedar em um subdiretório. A instalação prepara todos os arquivos do aplicativo em conjunto; uma versão nova aparece em “Atualizar aplicativo”. Ao aplicar, a página é recarregada e os arquivos da versão anterior são removidos, preservando favoritos e equipes. Áudio guardado também atende requisições parciais de bytes. Falhas de instalação ou armazenamento não bloqueiam a navegação normal.

Após alterar HTML, CSS, JavaScript, ícones ou o service worker, regenere o índice de arquivos antes de publicar o site:

```sh
node scripts/update-offline-assets.cjs
```

Esse comando usa somente módulos nativos do Node e gera uma revisão a partir do conteúdo dos arquivos. O exportador de prévias também o executa automaticamente. Os arquivos em `images/icons` foram gerados a partir de `images/app-icon.svg` nos tamanhos 180, 192 e 512 pixels.

As prévias em arquivo único não registram um service worker nem solicitam um manifesto externo. `preview-offline.html` mantém sua coleção incorporada de 43 Pokémon e 44 formas, independentemente dos recursos guardados pelo aplicativo instalável. Para testar a instalação, use a versão servida do `index.html`.

Em “Minha equipe”, use “Exportar imagem da equipe”. A prévia permite alterar o título e gerar outro PNG; “Baixar PNG” salva o arquivo para compartilhar. A composição usa os integrantes atuais, incluindo formas alternativas, e não muda com o tema da página. Retratos ausentes recebem um símbolo identificado no aviso; integrantes cujos dados não possam ser consultados impedem a geração. Alterar a equipe durante a preparação cancela a imagem antiga. O recurso funciona com os dados incorporados na prévia offline e com os retratos guardados pelo aplicativo.

Os favoritos são guardados em `localStorage` apenas neste navegador, sem conta ou sincronização entre dispositivos. Se o armazenamento estiver indisponível, eles continuam funcionando durante a sessão, com um aviso. Os filtros usam o tipo da forma padrão das espécies no catálogo; nos favoritos, consideram o tipo da forma salva. As gerações indicam a introdução da espécie. Falhas no catálogo, na linha evolutiva ou nas afinidades de tipos têm nova tentativa própria e não impedem a busca principal.

As afinidades usam as relações de dano recebidas da tabela de tipos atual. Os multiplicadores dos dois tipos são multiplicados, respeitando imunidades. Habilidades, itens, mudanças de tipo em batalha e tabelas históricas de gerações anteriores não entram no cálculo.

Em “Cobertura de ataques”, escolha até quatro tipos distintos ou use “Usar tipos de…” para preencher os tipos do Pokémon aberto. São escolhas livres de tipos de ataque: o recurso não consulta golpes aprendidos nem confirma sua disponibilidade em cada jogo. O resumo conta os 18 tipos defensivos isolados por melhor resultado entre os ataques escolhidos: super eficaz, neutro, resistência ou imunidade. “Ver tabela de cobertura” detalha cada ataque, o maior multiplicador e os empates. Ataques diferentes nunca são multiplicados entre si.

O alvo usa o Pokémon aberto, incluindo formas alternativas e seus dois tipos. Por exemplo, Pedra contra Fogo/Voador resulta em ×4 e Planta em ×0,25. Trocar o Pokémon recalcula o alvo, preservando os ataques escolhidos; mudar os ataques ou limpar a seleção cancela a consulta anterior. Imunidade a todos os ataques recebe uma mensagem explícita. A ferramenta usa apenas a tabela atual de tipos, sem calcular dano real, poder, precisão, atributos, habilidades, itens, clima ou bônus de mesmo tipo (STAB). Falhas e timeouts de 12 segundos ocultam os resultados incompletos e preservam as escolhas para nova tentativa.

As escolhas ficam em `pokedex.attack-coverage.v1` neste navegador e não entram no backup da coleção. Dados inválidos são descartados com aviso e o bloqueio do armazenamento mantém o uso durante a sessão. O painel vazio não consulta tipos. Para calcular, precisa dos 18 recursos públicos de tipos: eles estão incorporados na prévia offline; no site, podem ser consultados na rede e guardados pelo aplicativo para recálculo sem conexão. As escolhas não alteram favoritos, equipe, comparação ou progresso.

A equipe usa a chave `pokedex.team.v1` no `localStorage` e guarda apenas o número e o nome dos integrantes. A análise mostra quantos são vulneráveis, resistentes ou imunes aos tipos de ataque destacados. Se alguns integrantes não puderem ser consultados, o aviso identifica que a análise está incompleta. A comparação é independente da equipe e fica disponível durante a sessão; atributos base maiores não garantem vitória em batalha.

Em “Encontre seu próximo parceiro”, “Encontrar parceiros” compara os tipos de uma coleção de 43 Pokémon com as ameaças da equipe. Até três sugestões mostram resistências/imunidades úteis e fraquezas que também compartilham com a equipe. O critério dá peso ao número de integrantes vulneráveis, duplica esse peso quando nenhum integrante resiste ao tipo e favorece imunidades; fraquezas adicionais reduzem a pontuação. Empates usam a quantidade de ameaças cobertas e o número da Pokédex. As sugestões têm combinações de tipos diferentes e excluem espécies já presentes, inclusive quando a equipe usa uma forma alternativa. Não avaliam golpes, habilidades, itens, atributos ou disponibilidade em cada jogo. Abrir uma sugestão não altera a equipe; a inclusão acontece pelo botão habitual nos detalhes. Em equipes completas, é preciso avaliar e remover um integrante antes de adicionar outro.

O “Mapa defensivo da equipe” mostra os multiplicadores dos 18 tipos em uma tabela com rolagem horizontal. Dados parciais são identificados e impedem as sugestões até que todos os integrantes sejam consultados. Alterar a equipe cancela cálculos anteriores. A coleção de candidatos em `js/team-candidates.js` contém somente número, nome e tipos públicos da PokéAPI, gerados da coleção oficial de prévia com `node scripts/update-team-candidates.cjs`. O cálculo usa os recursos de tipos da API: na prévia offline eles estão incorporados; no site precisam ter sido consultados e guardados para usar sem conexão. Os detalhes e retratos de um candidato ainda não consultado podem precisar de rede no site.

Em “Equipes nomeadas”, use um nome de até 40 caracteres e “Salvar como nova” para guardar uma cópia da equipe atual. Escolha uma equipe salva e use “Carregar” para voltar a ela. Alterações nos integrantes ficam na equipe atual até clicar em “Atualizar com equipe atual”; renomear ou excluir uma cópia não modifica a equipe em uso. A biblioteca usa a chave separada `pokedex.teams.v1`, sem migrar ou apagar a equipe já existente. Formas alternativas, ordem e compartilhamento são preservados. Nomes repetidos são recusados e a última exclusão pode ser desfeita até recarregar a página ou excluir outra equipe. O armazenamento é local ao navegador; quando bloqueado, as equipes continuam disponíveis durante a sessão, com um aviso.

O seletor “Tema” no cabeçalho controla toda a interface e usa a chave `pokedex.theme.v1`. “Sistema” acompanha a preferência do dispositivo; “Claro” e “Escuro” prevalecem sobre ela. A aparência é aplicada antes da primeira pintura, inclusive nas prévias em arquivo único. O modo noturno do cenário continua sendo um controle independente. Se não for possível guardar a preferência, o tema escolhido funciona durante a sessão.

Em “Suas anotações”, escreva até 500 caracteres sobre a espécie aberta. O texto é salvo automaticamente em `pokedex.notes.v1` neste navegador, sem envio a um servidor. As formas compartilham o número nacional e a mesma nota. Há espaço para até 100 espécies; ao atingir o limite, notas existentes continuam editáveis e é possível apagar uma na lista para abrir espaço. Anotações vazias não ocupam uma vaga. Com armazenamento bloqueado, o texto permanece na sessão e pode ser exportado pelo backup.

“Encontrar anotações salvas” busca pelo nome, número ou texto, desconsiderando acentos e maiúsculas. A lista mostra o conteúdo completo em texto simples, inclusive quando a espécie não está disponível na prévia offline. O link abre os detalhes do Pokémon, e “Apagar” permite desfazer a última exclusão até recarregar ou apagar outra nota. Se uma nova nota já foi escrita para a mesma espécie ou não há espaço, desfazer preserva os dados atuais. Não há horários ou histórico de versões das notas. O acesso aparece também no menu “Seções” e em “Diário de campo” no cabeçalho.

O botão flutuante “Seções” reúne busca, Pokémon, espécie, anotações, afinidades, evoluções, equipe, comparação, cobertura, coleção e backup. A indicação “Você está em” acompanha a rolagem, e “Buscar” leva ao campo de pesquisa para digitar outra consulta. Ao escolher uma seção, o foco vai ao destino e o espaçamento considera a altura atual do cabeçalho. O menu usa um diálogo nativo: Tab permanece no painel, Escape, o botão de fechar ou um toque fora restauram o foco ao botão “Seções”. Os atalhos de página ficam pausados enquanto o menu está aberto. O link “Pular para o conteúdo” aparece ao receber foco pelo teclado.

Esses atalhos não alteram as escolhas nem o fragmento de uma equipe compartilhada pendente; os links existentes do cabeçalho continuam disponíveis. Movimentos respeitam a preferência de redução e o botão “Efeitos”. A barra considera a área segura do aparelho, e avisos e rodapé têm espaço para aparecer acima dela. A navegação não usa armazenamento nem consultas adicionais e funciona na prévia e no aplicativo offline. Sem suporte a diálogos nativos, o cabeçalho original permanece utilizável.

Nos detalhes, “Marcar como visto” e “Marcar captura” registram manualmente seus encontros nos jogos; abrir uma página ou usar o histórico não altera esse progresso. Capturado também conta como visto. Remover a captura mantém a espécie vista; para remover a marcação de visto, remova primeiro a captura. Todas as formas de uma espécie compartilham a marcação pelo número nacional, sem multiplicar a contagem. O registro em `pokedex.progress.v1` contém somente `{id, state}` por espécie e é independente de favoritos, equipe e histórico, com limite de 3.000 registros. Se o armazenamento estiver bloqueado, funciona na sessão e pode ser exportado no backup.

O filtro “Progresso” da coleção oferece vistos (incluindo capturados), capturados, ainda não vistos e faltam capturar. Combina com tipo, geração, favoritos e filtros avançados, e também entra nas buscas salvas. Combinações antigas sem esse campo continuam usando todos os registros. “Progresso nesta seleção” conta espécies únicas após os demais filtros e antes do filtro de progresso: por isso o total não diminui ao escolher “Capturados”. Na prévia offline, o total considera sua coleção de 43 espécies; no site considera a coleção disponível. Seleções vazias mostram 0%, e falhas ao consultar a seleção ocultam a contagem até uma nova tentativa.

“Vistos recentemente”, perto da busca, guarda até 12 Pokémon distintos na ordem da última abertura concluída. Busca, sugestões, navegação e seleção por outros painéis podem registrar um acesso; falhas, buscas canceladas e o Bulbasaur carregado automaticamente ao abrir a página não entram no histórico. Formas alternativas mantêm seu número nacional de espécie. Desmarque “Guardar próximos acessos” para pausar, inclusive nas próximas visitas; os registros existentes continuam acessíveis. “Limpar histórico” permite desfazer durante a sessão, preservando os acessos posteriores à limpeza até o limite de 12. Os registros usam `pokedex.recent.v1` e contêm apenas número, nome e espécie, sem horários. O histórico não guarda dados da API: abrir um registro offline exige que seus dados estejam disponíveis na prévia ou no cache do aplicativo.

Em “Explore a coleção” → “Minhas buscas salvas”, dê um nome de até 40 caracteres e use “Salvar filtros em uso”. São salvos tipo, geração, modo favoritos, progresso, categoria, habitat, atributo, limites e ordenação que já estão aplicados. Alterações ainda não aplicadas no formulário avançado não entram na combinação. Selecione uma busca, confira o resumo e use “Aplicar busca salva” para restaurar os controles e recalcular os resultados. As oito combinações ficam em `pokedex.filters.v1`; nomes repetidos são recusados. Excluir uma busca não altera os filtros em uso e a última exclusão pode ser desfeita enquanto houver vaga e o nome estiver livre. Nenhuma combinação é aplicada automaticamente ao abrir a página. As buscas guardam critérios, e os resultados acompanham os favoritos, o progresso e a coleção disponíveis naquele momento. Falhas de armazenamento mantêm os dois recursos funcionando na sessão, com aviso; histórico e buscas salvas não estão incluídos no backup da coleção.

Em “Backup da coleção”, “Exportar backup” prepara um arquivo JSON com favoritos, progresso, anotações, equipe atual e equipes nomeadas; “Baixar arquivo” permite iniciar o download novamente. Para transferir, escolha esse arquivo na outra Pokédex e confira a prévia. A leitura acontece no navegador, sem envio do arquivo a um servidor, e também funciona na prévia offline. A exportação usa o estado da sessão, inclusive quando o armazenamento está bloqueado; a preferência de tema e os dados baixados da API não entram no arquivo.

O formato de backup continua na versão 1 com o campo opcional `progress`. A prévia informa se ele está presente e como será importado. Mesclar une as marcações, preservando “capturado” quando o mesmo número está apenas “visto” no outro conjunto. Substituir usa o progresso exato do arquivo, inclusive um conjunto vazio explícito. Arquivos antigos sem o campo preservam o progresso atual em ambos os modos. Registros inválidos ou duplicados rejeitam o arquivo inteiro antes de qualquer alteração. Mudanças de progresso durante a prévia exigem nova revisão; após a importação, também impedem desfazer automaticamente para preservar as edições posteriores.

O campo opcional `notes` também usa o formato de backup versão 1 e contém `{id, name, text}` por espécie. Na mesclagem, notas de espécies novas são acrescentadas; textos diferentes para uma espécie já anotada preservam a versão atual e a prévia informa quantos conflitos existem. A substituição usa exatamente as notas do arquivo, inclusive um conjunto vazio explícito. Backups antigos sem `notes` preservam todas as notas atuais em ambos os modos. Ultrapassar 100 notas ou encontrar entradas inválidas/duplicadas rejeita a operação inteira. Editar uma nota durante a revisão exige conferir a prévia novamente, e edições posteriores à importação impedem desfazer para preservar o texto mais recente.

A mesclagem mantém os favoritos existentes e a equipe atual. Equipes nomeadas com o mesmo nome e integrantes são reaproveitadas; se os integrantes forem diferentes, a cópia importada recebe um sufixo no nome. Uma equipe atual diferente vinda do arquivo é guardada como “Equipe do backup”, quando ainda não existe uma cópia dela. Se a equipe atual estiver vazia, ela é carregada do arquivo. A substituição troca os favoritos e as equipes pelos dados exatos do arquivo, inclusive coleções vazias. A prévia explica a operação antes da importação. Arquivos incompatíveis ou maiores que 1 MB, dados inválidos e mesclagens que excedem as vinte equipes são recusados integralmente, sem truncar a coleção. Importar o mesmo arquivo novamente não cria novas cópias repetidas.

“Desfazer última importação” restaura a coleção anterior durante a sessão; se os dados tiverem sido editados depois da importação, o aviso preserva essas novas alterações e não aplica o desfazer. Se a coleção mudar enquanto a prévia está aberta, a prévia é atualizada antes de permitir importar. Falhas de armazenamento mantêm a coleção importada na sessão e exibem um aviso para exportá-la antes de sair.

Na comparação detalhada, o maior atributo base e o menor multiplicador de dano recebido têm destaques separados. Cada célula informa se o ataque é neutro, uma fraqueza, uma resistência ou uma imunidade. Habilidades são exibidas com os nomes da API e identificam as ocultas; seus efeitos e os de itens não entram na tabela de dano. A consulta das afinidades tem nova tentativa própria e não bloqueia os atributos, tipos e habilidades.

Use “Compartilhar equipe” para gerar um link quando a Pokédex estiver hospedada em HTTP/HTTPS. Arquivos, visualizadores isolados e endereços locais geram um código portátil, como `pokedex-team:v1:1,25,10034`. Em outra Pokédex, abra “Importar equipe” e cole o link ou código. Links recebidos mostram a prévia automaticamente; somente o botão “Carregar no lugar da equipe atual” substitui a seleção salva. Formas alternativas e a ordem são preservadas. Códigos inválidos, duplicados ou com mais de seis integrantes são recusados; se algum Pokémon não puder ser consultado ou não estiver na coleção offline, a importação não altera a equipe atual. Se a cópia automática for bloqueada, o texto fica disponível para copiar manualmente.

Abra “Filtros avançados”, escolha os critérios e use “Aplicar filtros”. Eles se combinam com tipo, geração e favoritos; “Limpar filtros” restaura todos os controles. A faixa usa os valores base da forma, com limites inclusivos. O habitat registrado na API é independente do cenário visual; “Não informado” seleciona espécies sem habitat registrado. Os filtros usam um índice local dos arquivos CSV públicos da PokéAPI, com a data informada na interface, sem consultar cada espécie durante a filtragem. Novos Pokémon sem dados nesse índice são identificados quando um filtro precisa dessas informações.

Para atualizar esse índice, execute `python3 scripts/update-catalog-facts.py`. A revisão de origem está fixada no script; use `--revision <hash-completo-do-commit>` para selecionar outra revisão do repositório público `PokeAPI/pokeapi`. O script baixa três CSVs com `curl`, preservando proxy e verificação TLS, valida os atributos e gera `js/catalog-facts.js`. Depois gere novamente as prévias HTML.

As descrições e categorias priorizam português quando fornecido pela API; na ausência, usam inglês, identificado no texto da descrição. O índice base de captura é apresentado na escala de 0 a 255 e não representa uma porcentagem de captura. As informações da espécie têm nova tentativa independente dos demais detalhes. A prévia offline também inclui essas informações e permite montar equipes e comparar membros da coleção incorporada.

As sugestões consultam o índice de Pokémon apenas quando você digita na busca e o reutilizam durante a sessão. A busca aceita espaços, acentos e números com zeros à esquerda. Se as sugestões não carregarem, a busca direta continua funcionando. As variedades vêm do campo `varieties` da espécie na PokéAPI: por exemplo, procure Charizard e escolha “Mega Evolução X”, ou Raichu e “Forma de Alola”. A disponibilidade dessas formas depende do jogo. Cada forma pode ser favoritada, adicionada à equipe e comparada separadamente; o número exibido e a navegação anterior/próximo continuam seguindo a espécie na Pokédex Nacional. A troca de forma preserva os detalhes atuais se a consulta falhar.

As condições de cada etapa evolutiva são lidas da PokéAPI. Requisitos da mesma condição devem ser cumpridos juntos; métodos distintos aparecem separados por “ou”. Quando a API indica uma condição principal, as demais ficam em “Outras condições”, com os respectivos jogos. Nomes de itens comuns são traduzidos; outros nomes próprios permanecem como fornecidos pela API. Regras ausentes não são inventadas, e condições especiais não detalhadas recebem uma indicação para consultar as regras do jogo.

## Verificar

```sh
node --check js/script.js
node --check js/api.js
node --check js/collection.js
node --check js/evolution.js
node --check js/scene.js
node --check js/feedback.js
node --check js/matchups.js
node --check js/evolution-conditions.js
node --check js/trainer.js
node --check js/species.js
node --check js/suggestions.js
node --check js/forms.js
node --check js/team-sharing.js
node --check js/advanced-filters.js
node --check js/catalog-facts.js
node --check js/theme.js
node --check js/saved-teams.js
node --check js/backup.js
node --check js/comparison.js
node --check js/offline-app.js
node --check js/team-image.js
node --check js/team-advisor.js
node --check js/recent-pokemon.js
node --check js/filter-presets.js
node --check js/dex-progress.js
node --check js/attack-coverage.js
node --check js/section-navigation.js
node --check js/field-notes.js
node --check sw.js
node --check offline-assets.js
```

As 68 verificações de regras podem ser executadas sem dependências extras:

```sh
node tests/rules.test.mjs
```

Elas verificam multiplicadores de tipos duplos, neutralizações e imunidades, formatação e separação de condições evolutivas por jogo, comparação de atributos, fraquezas compartilhadas, seleção do idioma das descrições, ordenação e normalização das sugestões, identificação das formas, validação de equipes compartilhadas e combinação dos filtros avançados. Quando a coleção baixada está disponível, também comparam os atributos e categorias do índice com todos os Pokémon e formas dessa coleção.

Os testes de navegador em `tests/browser.cjs`, `tests/exploration.cjs`, `tests/visual.cjs` e `tests/strategy.cjs` usam Playwright e respostas simuladas da API. Com o servidor iniciado, instale as ferramentas de teste fora do projeto e execute:

```sh
npm install --prefix /tmp/pokedex-browser-tests --no-audit --no-fund playwright
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node /tmp/pokedex-browser-tests/node_modules/playwright/cli.js install chromium
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/browser.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/exploration.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/visual.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/strategy.cjs
# Depois de gerar preview.html:
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/preview.cjs
# Depois de gerar preview-offline.html:
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/trainer.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/discovery.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/sharing-filters.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/themes-teams.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/backup-comparison.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/team-image.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/team-advisor.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/navigation-memory.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/dex-progress.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/attack-coverage.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/section-navigation.cjs
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/field-notes.cjs
# Teste independente com servidor local próprio e service worker real:
NODE_PATH=/tmp/pokedex-browser-tests/node_modules node tests/pwa.cjs
```

Se o Chromium já estiver instalado, pule o download e, se necessário, defina `CHROMIUM_PATH` com o caminho do executável. Use `POKEDEX_URL` para testar outro endereço do servidor. Os testes cobrem busca, navegação, shiny, cache, falhas de rede, nova tentativa, timeout, respostas fora de ordem, imagens alternativas e larguras de 320 a 1.440 pixels. Também verificam a persistência e remoção de favoritos, armazenamento inválido ou bloqueado, filtros combinados e respostas fora de ordem, paginação, evoluções em árvore, seleção e recuperação de falhas independentes. A suíte visual verifica os seis cenários, modo noturno, interação por toque, atalhos, redução de movimento e reprodução/parada de áudio com um arquivo de teste local, incluindo falhas. A suíte de estratégia cobre os multiplicadores exibidos, condições por jogo, seleção de evoluções, falhas, nova tentativa, timeout e proteção contra respostas antigas. As respostas simuladas não verificam a disponibilidade real da PokéAPI.

A suíte `tests/trainer.cjs` usa os dados reais da coleção offline para verificar o limite e a persistência da equipe, fraquezas compartilhadas, comparação, informações da espécie e larguras de tela, sem requisições externas. Também simula armazenamento bloqueado e falha na consulta da espécie para verificar a recuperação independente.

A suíte `tests/discovery.cjs` verifica sugestões por teclado e clique, seleção de formas de Alola e Mega Evoluções, numeração e navegação pela espécie, favoritos e equipe com formas, comparação e recuperação de falhas. Percorre também as 44 formas incorporadas à prévia offline sem requisições externas.

A suíte `tests/sharing-filters.cjs` verifica links e códigos de equipe, prévia antes de importar, cancelamento, persistência, formas, falha de rede, nova tentativa, respostas antigas, bloqueios de armazenamento e da área de transferência, filtros combinados, faixas inválidas e com zero, ordenação, paginação e layout responsivo. Links públicos são simulados no navegador; o teste não publica o site.

A suíte `tests/themes-teams.cjs` verifica tema do sistema e escolhas explícitas, persistência, independência do modo noturno do cenário, contraste de textos e controles no tema escuro, larguras de 320 a 1.440 pixels, preservação da equipe existente, cópias nomeadas independentes, atualização, renomeação, exclusão e desfazer, limite de 20 equipes, nomes inválidos ou repetidos, dados corrompidos e uso com armazenamento bloqueado. Os testes de regras também cobrem a seleção do tema e a validação da biblioteca de equipes.

A suíte `tests/backup-comparison.cjs` baixa um arquivo real e o transfere para outro contexto de navegador; verifica prévia, mesclagem, conflitos, desfazer, substituição, persistência, arquivos inválidos ou grandes, mudanças feitas durante a prévia e após a importação, armazenamento bloqueado e exportação dos dados da sessão. Confere também habilidades ocultas, as 18 relações de dano, formas alternativas, ×4/×0,25, imunidades, ambos os temas, larguras de 320 a 1.440 pixels, falha independente, nova tentativa e cancelamento de comparações antigas. As verificações de regras incluem validação e limites do backup, mesclagem sem duplicação e comparação defensiva.

A suíte `tests/team-image.cjs` baixa e valida um PNG real de seis integrantes, dimensões, formas alternativas, título, cancelamento por mudança da equipe, retratos ausentes, integrantes indisponíveis e ambos os temas em telas de 320 a 1.440 pixels. A geração na prévia exige zero requisições externas.

A suíte `tests/team-advisor.cjs` valida os 18 tipos da tabela defensiva, multiplicadores duplos, abertura e inclusão deliberada de sugestões, falha de tipos e nova tentativa, cancelamento por mudança da equipe, limite de seis, dados parciais e ambos os temas em telas de 320 a 1.440 pixels, sem requisições externas. As regras verificam a cobertura real, riscos, exclusão de espécies já presentes e correspondência da coleção de candidatos com os dados oficiais incorporados.

A suíte `tests/navigation-memory.cjs` verifica histórico sem duplicatas, formas regionais, pausa persistente, limpeza/desfazer com novos acessos, limite de 12, buscas malsucedidas, restauração de todos os filtros aplicados, preservação de rascunhos fora das buscas salvas, nomes repetidos ou vazios, limite de oito, exclusão/desfazer, dados inválidos, armazenamento bloqueado e ambos os temas em telas de 320 a 1.440 pixels, sem requisições externas. A suíte de busca também garante que respostas antigas e timeouts não registram acessos; a suíte do aplicativo recarrega sem rede e reabre histórico e filtros salvos com recursos realmente guardados.

A suíte `tests/dex-progress.cjs` verifica transições manuais de visto/capturado, formas compartilhando a espécie, filtros e buscas salvas, contagens sem duplicação e seleções vazias, recarga, download real e transferência do backup, mesclagem e substituição, preservação de progresso em backups antigos, prévias desatualizadas, desfazer com edições posteriores, corrupção, armazenamento bloqueado e exportação do progresso da sessão. Também cobre ambos os temas de 320 a 1.440 pixels sem rede. A suíte do aplicativo confirma capturas preservadas ao recarregar offline e limpar apenas os dados públicos guardados.

A suíte `tests/attack-coverage.cjs` cobre os quatro tipos distintos, contagens e tabela de 18 tipos, melhor ataque sem multiplicação entre ataques, empates, tipos duplos, imunidades, formas alternativas, alvo atualizado, atalho dos tipos atuais, persistência, limpeza e cancelamento, falta de dados, nova tentativa, timeout real da consulta, dados salvos inválidos e armazenamento bloqueado. Verifica ambos os temas de 320 a 1.440 pixels e coluna fixa na tabela. A prévia funciona com zero requisições externas; a suíte do aplicativo também recalcula a cobertura após recarga offline com tipos efetivamente guardados pelo service worker.

A suíte `tests/section-navigation.cjs` verifica o link de salto, indicação da seção pela rolagem, foco preso no diálogo e devolvido ao fechar, isolamento dos atalhos de página, onze destinos visíveis sob o cabeçalho, retorno à busca, botão de fechar, toque fora, preservação de dados, ambos os temas em 320–1.440 pixels, espaço para avisos e rodapé, toque no celular, links de equipes pendentes, armazenamento bloqueado e ausência de diálogos nativos. O teste exige zero requisições externas; a suíte do aplicativo também abre o menu e usa seus atalhos após recarga sem rede.

A suíte `tests/field-notes.cjs` verifica salvamento automático e posição do cursor, compartilhamento entre formas, recarga, busca por texto/nome com acentos, renderização literal de marcação, limite de 500 caracteres, exclusão/desfazer sem sobrescrever uma versão nova, transferência real de backup, conflitos, substituição, arquivos antigos, revisão desatualizada, limites e dados inválidos. Cobre ambos os temas em 320–1.440 pixels, leitura de notas de espécies indisponíveis, limite de 100, recuperação de armazenamento corrompido e exportação dos dados da sessão quando o armazenamento é bloqueado, com zero requisições externas. A suíte do aplicativo verifica as notas após recarga offline e limpeza dos dados públicos guardados.

A suíte `tests/pwa.cjs` usa um service worker real em um subdiretório, valida o manifesto e os ícones, bloqueia as requisições externas e recarrega a página sem rede. Confere consultas por nome, imagens, dados de espécie e tipos, áudio com intervalos de bytes, exportação PNG com recursos guardados, mensagens para consultas não armazenadas, limpeza sem perder favoritos/equipes, atualização real do worker e falha na instalação. A interação com o convite de instalação é simulada; o teste não instala um aplicativo no sistema operacional. As demais suítes bloqueiam service workers para manter as respostas simuladas da API isoladas.

Projeto de fã, sem afiliação à Nintendo, Game Freak ou The Pokémon Company.
