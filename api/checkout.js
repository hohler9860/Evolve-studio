const Stripe = require('stripe');

const PLANS = {
  starter: { name: 'Starter', setup: 49999, monthly: 2499 },
  growth:  { name: 'Growth',  setup: 94999, monthly: 2499 },
  premium: { name: 'Premium', setup: 149999, monthly: 1999 }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payments are not configured. Please contact us.' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { plan, email, businessName, amount, description } = req.body;
  const baseUrl = `https://${req.headers.host}`;

  try {
    let lineItems, metadata, cancelUrl;

    if (plan === 'custom' && amount) {
      const cents = Math.round(parseFloat(amount) * 100);
      if (cents < 50) {
        return res.status(400).json({ error: 'Amount must be at least $0.50.' });
      }

      const desc = description || 'Custom payment';
      lineItems = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `evolve studio - ${desc}`,
            description: businessName ? `Payment for ${businessName}` : desc
          },
          unit_amount: cents
        },
        quantity: 1
      }];
      metadata = { type: 'custom', business_name: businessName || '', description: desc };
      cancelUrl = `${baseUrl}/pay.html?amount=${amount}&desc=${encodeURIComponent(desc)}${businessName ? '&client=' + encodeURIComponent(businessName) : ''}`;

    } else if (plan && PLANS[plan]) {
      const selected = PLANS[plan];
      lineItems = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `evolve studio - ${selected.name} Plan (Setup)`,
            description: `One-time website setup fee for the ${selected.name} plan. Monthly hosting ($${(selected.monthly / 100).toFixed(2)}/mo) will be billed separately.`
          },
          unit_amount: selected.setup
        },
        quantity: 1
      }];
      metadata = { plan, business_name: businessName || '', monthly_amount: selected.monthly };
      cancelUrl = `${baseUrl}/pay.html?plan=${plan}`;

    } else {
      return res.status(400).json({ error: 'Invalid plan or amount.' });
    }

    const sessionConfig = {
      mode: 'payment',
      line_items: lineItems,
      metadata,
      success_url: `${baseUrl}/pay-success.html`,
      cancel_url: cancelUrl
    };

    if (email) sessionConfig.customer_email = email;

    const sessionObj = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: sessionObj.url });

  } catch (err) {
    console.error('Stripe checkout error:', err.type, err.message, err.code);
    res.status(500).json({ error: err.message || 'Failed to create checkout session. Please try again.' });
  }
};
