import type { Extension } from '@gcscode/extension-api';

import RadioInputView from './radio-input-view.svelte';
import { DEFAULT_STATION_URL, setStationAddressSource } from './station-address';

export const manualControlExtension: Extension = {
  manifest: {
    id: 'gcscode.manual-control',
    displayName: 'Manual control',
    version: '0.0.0',
    description:
      'Shows the raw input of the radio the station has open. Reads only: it sends nothing to the station, the radio or any vehicle.',
  },
  activate(context) {
    // The station's address is the MAVLink extension's setting, since the
    // station is that extension's native half (ADR-0015 Decision 3). It is
    // read when the view opens, not here: activation order is not guaranteed
    // (ADR-0005), and the setting may not be registered yet.
    const configuration = context.host.configuration;
    setStationAddressSource(() =>
      configuration
        .getConfiguration('gcscode.mavlink')
        .get<string>('stationUrl', DEFAULT_STATION_URL),
    );

    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.manual-control.radio-input',
        component: RadioInputView,
        title: 'Radio input',
      }),
    );
  },
};
