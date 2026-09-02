import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TwinScrewExtruder } from '../../components/console/machine/TwinScrewExtruder';
const twin = renderToStaticMarkup(React.createElement(TwinScrewExtruder, { showBackground: true, showPartLabels: true }));
const plain = renderToStaticMarkup(React.createElement(TwinScrewExtruder, { showBackground: true }));
process.stdout.write(JSON.stringify({ twin, plain }));
