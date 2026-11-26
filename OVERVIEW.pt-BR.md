O Sidebar+ é uma visualização de barra lateral em que você cria grupos para seus projetos ou agrupa os workspaces por status ou rótulo. As linhas dos workspaces mostram o status do agente e podem incluir branch, pull request, verificações e serviços.

## Configuração

- Requer Paseo 0.16.0 ou posterior no daemon e no app.
- Depois de instalar, escolha **Sidebar+** em **Configurações > Barra lateral**. Escolha ali a barra lateral padrão para voltar.
- Selecione o botão de controles deslizantes no topo da visualização para abrir as **Preferências de exibição**. Lá você muda os campos das linhas, o tamanho do texto, a altura da linha ou o recuo.
- Disponível em inglês, chinês (simplificado), japonês, coreano, espanhol, francês, português (Brasil), russo e árabe.

## Organizar

- **Grupos e subgrupos:** coloque projetos em grupos, com um nível de subgrupos, cada um com uma cor e um ícone ou emoji.
- **Arrastar para organizar:** reordene grupos, subgrupos, projetos e workspaces fixados, ou arraste um projeto para outro grupo. Em telas sensíveis ao toque, mantenha pressionado primeiro.
- **Recolher:** grupos e projetos recolhidos mostram uma contagem, e um ponto de status quando algo precisa de atenção ou está em execução.
- **Agrupar por:** projeto, status ou rótulo.
- **Ordenar:** por nome, última atividade ou data de criação, ou arraste os workspaces para uma ordem manual.

## Linhas dos workspaces

- **Status:** executando, aguarda entrada, atenção, concluído ou com falha.
- **Linha 1:** o título, e a última atividade quando essa opção está ativada.
- **Campos:** branch, projeto, pull request, verificações, alterações, serviços em execução e rótulos. Coloque cada um na linha 2 ou na linha 3, ou oculte-o. Linhas fixadas sempre mostram o projeto.
- **Pull requests:** número e estado, quando o host os fornece. Toque em um pull request com link para abri-lo no navegador.
- **Serviços:** serviços em execução, com portas quando disponíveis.
- **Linhas curtas:** linhas vazias são recolhidas, então workspaces simples ocupam uma só linha.

## Encontrar

- **Busca:** encontra por título, branch, projeto, rótulo e host.
- **Filtros:** por host, projeto ou rótulo.
- **Ir para o atual:** traz de volta à vista o workspace aberto e expande o grupo dele, se necessário.
- **Cabeçalhos fixos:** mantêm o grupo e o projeto atuais visíveis na web e no desktop.

## Agir

- **Menu do workspace:** copiar caminho ou branch, renomear, fixar, rótulos e arquivar com uma etapa de confirmação.
- **Menu do projeto:** novo workspace, copiar caminho, cor e ícone, mover para grupo e arquivar workspaces.
- **Arquivamento em massa:** arquive vários workspaces de um projeto de uma vez, com seleções rápidas para concluídos, mesclados e ociosos. Workspaces em execução, aguardando entrada, fixados e abertos no momento, além dos que têm um pull request aberto ou em rascunho, não são selecionados por padrão.

## Acesso a dados

- Lê workspaces, projetos e hosts dos seus hosts Paseo conectados, incluindo detalhes de pull requests, verificações e serviços.
- Só altera um workspace (renomear, fixar, rótulos, arquivar) quando você escolhe essa ação.
- Grupos, ordem dos projetos, cores e ícones dos cabeçalhos, preferências de exibição e a ordem manual dos workspaces e dos fixados ficam salvos nas configurações do plugin no host Paseo e são compartilhados pelos dispositivos dele.
- Filtros e o estado recolhido ficam salvos em cada dispositivo.
- Não se comunica com nenhum serviço fora do Paseo. Os links de pull requests abrem no seu navegador.
