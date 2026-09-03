import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SingleScrewExtruder } from '../../components/console/machine/SingleScrewExtruder';
process.stdout.write(renderToStaticMarkup(React.createElement(SingleScrewExtruder, {
  showBackground: true, connectorState: { MOTOR_RPM: 'live', MOTOR_TEMP: 'linked' },
})));
