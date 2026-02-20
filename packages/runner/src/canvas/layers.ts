import { Container } from 'pixi.js';

export interface LayerHierarchy {
  readonly boardGroup: Container;
  readonly backgroundLayer: Container;
  readonly adjacencyLayer: Container;
  readonly zoneLayer: Container;
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
  const adjacencyLayer = new Container();
  const zoneLayer = new Container();
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

  backgroundLayer.eventMode = 'none';
  backgroundLayer.interactiveChildren = false;
  backgroundLayer.sortableChildren = false;

  zoneLayer.eventMode = 'passive';
  zoneLayer.interactiveChildren = true;
  zoneLayer.sortableChildren = true;

  tableOverlayLayer.eventMode = 'none';
  tableOverlayLayer.interactiveChildren = false;
  tableOverlayLayer.sortableChildren = true;

  boardGroup.addChild(backgroundLayer, adjacencyLayer, zoneLayer, tableOverlayLayer);

  return {
    boardGroup,
    backgroundLayer,
    adjacencyLayer,
    zoneLayer,
    tableOverlayLayer,
    tokenGroup,
    effectsGroup,
    interfaceGroup,
    hudGroup,
  };
}
