import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TwinScrewExtruder } from '../../components/console/machine/TwinScrewExtruder';
import { TWIN_SCREW_POINT_REGISTRY } from '../../lib/twinScrewExtruderPoints';
const mixed = {};
TWIN_SCREW_POINT_REGISTRY.forEach((p, i) => { mixed[p.code] = ['idle','linked','live'][i % 3]; });
process.stdout.write(JSON.stringify({
  labelled: renderToStaticMarkup(React.createElement(TwinScrewExtruder, { showBackground: true, showPartLabels: true, connectorState: mixed })),
  plain: renderToStaticMarkup(React.createElement(TwinScrewExtruder, { showBackground: true })),
}));
