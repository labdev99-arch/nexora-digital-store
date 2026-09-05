import {describe, expect, it} from 'vitest';

import {renderTemplate} from './template';

describe('notification template rendering', () => {
  it('replaces scalar variables and builds a locale-aware order URL', () => {
    expect(
      renderTemplate(
        {subject: 'Order {{order_number}}', body: 'Total {{amount}}'},
        {order_id: 'order-id', order_number: 'NX-100', amount: 2500},
        'ar'
      )
    ).toEqual({
      subject: 'Order NX-100',
      body: 'Total 2500',
      actionUrl: '/ar/account/orders/order-id',
      providerTemplateName: null
    });
  });

  it('does not serialize objects into customer messages', () => {
    const rendered = renderTemplate(
      {body: 'Safe {{private_data}} {{status}}'},
      {private_data: {secret: true}, status: 'paid'},
      'en'
    );
    expect(rendered.body).toBe('Safe  paid');
  });
});
