const errorSchema = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: {const: false},
    error: {
      type: 'object',
      required: ['code', 'message', 'request_id'],
      properties: {
        code: {type: 'string'},
        message: {type: 'string'},
        details: {},
        request_id: {type: 'string'}
      }
    }
  }
};

const signedSecurity = [{ApiKey: [], HmacSignature: []}];

export function resellerOpenApi(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Nexora Reseller API',
      version: '1.0.0',
      description: 'Signed wholesale catalog, ordering, balance, and webhook API.'
    },
    servers: [{url: `${origin}/api/v1`}],
    tags: [{name: 'Catalog'}, {name: 'Orders'}, {name: 'Account'}, {name: 'Webhooks'}],
    components: {
      securitySchemes: {
        ApiKey: {type: 'apiKey', in: 'header', name: 'X-Nexora-Key'},
        HmacSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Nexora-Signature',
          description: 'HMAC-SHA256 over timestamp, nonce, method, path and SHA-256 body.'
        }
      },
      schemas: {
        Error: errorSchema,
        OrderInput: {
          type: 'object',
          required: ['currencyCode', 'items'],
          properties: {
            currencyCode: {type: 'string', pattern: '^[A-Z]{3}$'},
            localeCode: {type: 'string', default: 'en'},
            countryCode: {type: 'string', default: 'LB'},
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                required: ['variantId', 'quantity'],
                properties: {
                  variantId: {type: 'string', format: 'uuid'},
                  quantity: {type: 'integer', minimum: 1},
                  optionValues: {type: 'object', additionalProperties: true}
                }
              }
            }
          }
        }
      }
    },
    security: signedSecurity,
    paths: {
      '/products': {
        get: {
          tags: ['Catalog'],
          summary: 'List wholesale products',
          responses: {
            '200': {description: 'Products'},
            default: {
              description: 'Error',
              content: {'application/json': {schema: {$ref: '#/components/schemas/Error'}}}
            }
          }
        }
      },
      '/prices': {
        get: {
          tags: ['Catalog'],
          summary: 'List tier prices',
          responses: {'200': {description: 'Prices'}}
        }
      },
      '/stock': {
        get: {
          tags: ['Catalog'],
          summary: 'List current stock',
          responses: {'200': {description: 'Stock'}}
        }
      },
      '/orders': {
        get: {
          tags: ['Orders'],
          summary: 'List orders',
          responses: {'200': {description: 'Orders'}}
        },
        post: {
          tags: ['Orders'],
          summary: 'Place an idempotent order',
          parameters: [
            {name: 'Idempotency-Key', in: 'header', required: true, schema: {type: 'string'}}
          ],
          requestBody: {
            required: true,
            content: {'application/json': {schema: {$ref: '#/components/schemas/OrderInput'}}}
          },
          responses: {
            '201': {description: 'Order created'},
            '409': {description: 'Replay conflict'}
          }
        }
      },
      '/orders/{id}': {
        get: {
          tags: ['Orders'],
          summary: 'Get order status',
          parameters: [
            {name: 'id', in: 'path', required: true, schema: {type: 'string', format: 'uuid'}}
          ],
          responses: {'200': {description: 'Order'}}
        }
      },
      '/balance': {
        get: {
          tags: ['Account'],
          summary: 'Get balances',
          responses: {'200': {description: 'Balances'}}
        }
      },
      '/webhooks': {
        get: {
          tags: ['Webhooks'],
          summary: 'List webhook endpoints',
          responses: {'200': {description: 'Endpoints'}}
        },
        post: {
          tags: ['Webhooks'],
          summary: 'Create webhook endpoint',
          responses: {'201': {description: 'Endpoint and one-time secret'}}
        }
      }
    }
  } as const;
}
