This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Environment Variables

For the trade analysis and candlestick chart features, you need to set up API credentials:

```bash
GEMINI_API_KEY=your_google_gemini_api_key
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
```

Create a `.env.local` file in the root directory and add these variables:

- `GEMINI_API_KEY`: Google Gemini API key for screenshot analysis
- `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`: Alpaca API credentials for historical market data

## Candlestick Charts

The application includes a foundation for displaying historical candlestick charts:

- **API Endpoint**: `POST /api/chart` - Accepts `{ ticker, startTime, endTime }` and returns candle data
- **Component**: `components/TradeChart.tsx` - Reusable chart component using TradingView Lightweight Charts
- **Data Source**: Alpaca Market Data API (5-minute bars)

The chart feature is currently standalone and not yet connected to the trade analyzer.
