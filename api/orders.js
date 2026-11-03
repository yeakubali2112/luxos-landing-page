const fs = require('fs');
const path = require('path');

const ORDERS_FILE = path.join('/tmp', 'orders.json');

function loadOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
    }
    const bundled = path.join(__dirname, '..', 'data', 'orders.json');
    if (fs.existsSync(bundled)) {
      const orders = JSON.parse(fs.readFileSync(bundled, 'utf-8'));
      try {
        if (!fs.existsSync(path.dirname(ORDERS_FILE))) fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
      } catch (e) {}
      return orders;
    }
  } catch (e) {}
  return [];
}

function saveOrders(orders) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const orders = loadOrders();

      // Check if this is a status update
      if (payload.action === 'status' || (payload.id && payload.status && !payload.fullName)) {
        const target = orders.find(o => o.id === payload.id);
        if (target) {
          target.status = payload.status;
          target.updatedAt = new Date().toISOString();
          saveOrders(orders);
          return res.status(200).json({ ok: true, order: target });
        }
        return res.status(404).json({ ok: false, error: 'Order not found' });
      }

      // Check if this is a delete request
      if (payload.action === 'delete' || (payload.id && !payload.fullName && !payload.status)) {
        const filtered = orders.filter(o => o.id !== payload.id);
        saveOrders(filtered);
        return res.status(200).json({ ok: true, id: payload.id });
      }

      const fullName = (payload.fullName || payload.name || '').trim();
      const phone = (payload.phone || '').trim();
      const address = (payload.address || '').trim();
      const area = payload.area === 'outside' ? 'outside' : 'inside';
      const quantity = parseInt(payload.quantity, 10) || 1;
      const unitPrice = parseInt(payload.unitPrice, 10) || 2350;
      const deliveryCharge = area === 'outside' ? 130 : 70;
      const totalPrice = (unitPrice * quantity) + deliveryCharge;

      if (!fullName || !phone || !address) {
        return res.status(400).json({ ok: false, error: 'নাম, মোবাইল নম্বর এবং ঠিকানা আবশ্যক।' });
      }

      const orderCount = orders.length + 1;
      const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      const orderId = `LX-${dateStr}-${String(orderCount).padStart(3, '0')}`;

      const newOrder = {
        id: orderId,
        createdAt: new Date().toISOString(),
        customer: {
          name: fullName,
          phone: phone,
          address: address,
          area: area,
          areaName: area === 'inside' ? 'ঢাকা সিটি' : 'ঢাকার বাইরে'
        },
        product: {
          name: payload.productName || 'The Aster by LUXOS',
          color: payload.colorName || payload.color || 'Rosewood',
          colorKey: payload.color || 'rosewood',
          quantity: quantity,
          unitPrice: unitPrice
        },
        pricing: {
          subtotal: unitPrice * quantity,
          delivery: deliveryCharge,
          total: totalPrice
        },
        status: 'pending',
        notes: payload.notes || ''
      };

      orders.unshift(newOrder);
      saveOrders(orders);

      return res.status(201).json({
        ok: true,
        orderId: newOrder.id,
        order: newOrder,
        message: 'অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে!'
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'GET') {
    const orders = loadOrders();
    return res.status(200).json({ ok: true, orders });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};

