import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TwinScrewExtruder } from '../../components/console/machine/TwinScrewExtruder';
import { createTemplateDefaultLayout } from '../../components/console/machine/templateDefaultLayouts';
const twin = renderToStaticMarkup(React.createElement(TwinScrewExtruder, { showBackground: true }));
const layout = createTemplateDefaultLayout('Twin Screw Extruder', [], null);
process.stdout.write(JSON.stringify({ twin, layout }));
