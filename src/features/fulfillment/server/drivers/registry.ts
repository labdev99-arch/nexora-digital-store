import 'server-only';

import {MockSupplierDriver} from './mock-driver';
import {ResellerApiDriver} from './reseller-api-driver';
import {SmmPanelDriver} from './smm-panel-driver';
import type {SupplierDriver} from './supplier-driver';

const drivers = new Map<SupplierDriver['code'], SupplierDriver>([
  ['smm_panel', new SmmPanelDriver()],
  ['reseller_api', new ResellerApiDriver()],
  ['mock', new MockSupplierDriver()]
]);

export function getSupplierDriver(code: string): SupplierDriver {
  const driver = drivers.get(code as SupplierDriver['code']);
  if (!driver) throw new Error(`supplier_driver_not_registered:${code}`);
  return driver;
}

export function registeredSupplierDrivers() {
  return [...drivers.keys()];
}
