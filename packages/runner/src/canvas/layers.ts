import { Container } from 'pixi.js';

export interface LayerHierarchy {
  readonly boardGroup: Container;
  readonly backgroundLayer: Container;
  readonly regionLayer: Container;
  readonly provinceZoneLayer: Container;
  readonly connectionRouteLayer: Container;
  readonly cityZoneLayer: Container;
  readonly adjacencyLayer: Container;
  readonly tableOverlayLayer: Container;
  readonly tokenGroup: Container;
  readonly effectsGroup: Container;
  readonly interfaceGroup: Container;
  readonly hudGroup: Container;
}

function configureLayer(
  layer: Container,
  eventMode: 'passive' | 'none',
  interactiveChildren: boolean,
): void {
  layer.eventMode = eventMode;
  layer.interactiveChildren = interactiveChildren;
  layer.sortableChildren = true;
}

export function createLayerHierarchy(): LayerHierarchy {
  const boardGroup = new Container();
  const backgroundLayer = new Container();
  const regionLayer = new Container();
  const provinceZoneLayer = new Container();
  const connectionRouteLayer = new Container();
  const cityZoneLayer = new Container();
  const adjacencyLayer = new Container();
  const tableOverlayLayer = new Container();
  const tokenGroup = new Container();
  const effectsGroup = new Container();
  const interfaceGroup = new Container();
  const hudGroup = new Container();

  configureLayer(boardGroup, 'passive', true);
  configureLayer(tokenGroup, 'passive', true);
  configureLayer(effectsGroup, 'none', false);
  configureLayer(interfaceGroup, 'none', false);
  configureLayer(hudGroup, 'none', false);

  adjacencyLayer.eventMode = 'none';
  adjacencyLayer.interactiveChildren = false;
  adjacencyLayer.sortableChildren = true;

  connectionRouteLayer.eventMode = 'passive';
  connectionRouteLayer.interactiveChildren = true;
  connectionRouteLayer.sortableChildren = true;

  backgroundLayer.eventMode = 'none';
  backgroundLayer.interactiveChildren = false;
  backgroundLayer.sortableChildren = false;

  regionLayer.eventMode = 'none';
  regionLayer.interactiveChildren = false;
  regionLayer.sortableChildren = false;

  provinceZoneLayer.eventMode = 'passive';
  provinceZoneLayer.interactiveChildren = true;
  provinceZoneLayer.sortableChildren = true;

  cityZoneLayer.eventMode = 'passive';
  cityZoneLayer.interactiveChildren = true;
  cityZoneLayer.sortableChildren = true;

  tableOverlayLayer.eventMode = 'none';
  tableOverlayLayer.interactiveChildren = false;
  tableOverlayLayer.sortableChildren = true;

  boardGroup.addChild(
    backgroundLayer,
    regionLayer,
    provinceZoneLayer,
    connectionRouteLayer,
    cityZoneLayer,
    adjacencyLayer,
    tableOverlayLayer,
  );

  return {
    boardGroup,
    backgroundLayer,
    regionLayer,
    provinceZoneLayer,
    connectionRouteLayer,
    cityZoneLayer,
    adjacencyLayer,
    tableOverlayLayer,
    tokenGroup,
    effectsGroup,
    interfaceGroup,
    hudGroup,
  };
}
