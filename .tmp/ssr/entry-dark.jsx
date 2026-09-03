import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TwinScrewExtruder } from '../../components/console/machine/TwinScrewExtruder';
process.stdout.write(JSON.stringify({
  dark: renderToStaticMarkup(React.createElement(TwinScrewExtruder, { showBackground: true, showPartLabels: true })),
}));
