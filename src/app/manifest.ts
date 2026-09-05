import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Nexora — Digital life, delivered',
    short_name: 'Nexora',
    description: 'Top-ups, subscriptions, gift cards, and digital services in one trusted wallet.',
    start_url: '/en',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'portrait-primary',
    categories: ['shopping', 'business', 'finance'],
    background_color: 'rgb(10, 10, 15)',
    theme_color: 'rgb(10, 10, 15)',
    icons: [
      {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'}
    ],
    shortcuts: [
      {
        name: 'Browse products',
        short_name: 'Products',
        url: '/en/products',
        icons: [{src: '/icons/icon-192.png', sizes: '192x192'}]
      },
      {
        name: 'My orders',
        short_name: 'Orders',
        url: '/en/account/orders',
        icons: [{src: '/icons/icon-192.png', sizes: '192x192'}]
      },
      {
        name: 'Wallet',
        short_name: 'Wallet',
        url: '/en/account/wallet',
        icons: [{src: '/icons/icon-192.png', sizes: '192x192'}]
      }
    ],
    share_target: {
      action: '/en/products',
      method: 'GET',
      params: {title: 'title', text: 'text', url: 'url'}
    }
  };
}
