import { createContext } from 'react';

import type { VisualConfigProvider } from './visual-config-provider.js';

export const VisualConfigContext = createContext<VisualConfigProvider | null>(null);
