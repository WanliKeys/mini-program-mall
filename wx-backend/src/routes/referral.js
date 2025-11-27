const express = require('express');
const router = express.Router();
const axios = require('axios');
const { buildJsSdkSignature, getCurrentH5AppId, getAccessToken } = require('../utils/wechatJsSdk');
const { success, error } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../config/database');
const DEFAULT_LANDING = 'https://jxxcfwlkj.cn/referral-jump.html';
const miniProgramTokenCache = {
  accessToken: null,
  expiresAt: 0
};

function buildMiniProgramPath(params) {
  const queryParams = [];
  const path = 'pages/order/confirm/confirm';

  queryParams.push(`isReferral=true`);
  if (params.productId) queryParams.push(`productId=${params.productId}`);
  if (params.linkCode) queryParams.push(`linkCode=${params.linkCode}`);
  if (params.partnerOrderNo) queryParams.push(`partnerOrderNo=${params.partnerOrderNo}`);
  if (params.notifyUrl) queryParams.push(`notifyUrl=${encodeURIComponent(params.notifyUrl)}`);
  queryParams.push(`quantity=${params.quantity || 1}`);

  return `${path}?${queryParams.join('&')}`;
}

async function generateSignedLandingUrl(link, {
  linkCode,
  partnerOrderNo,
  notifyUrl,
  externalOrderNo,
  env = 'release'
}) {
  const landingBase = process.env.REFERRAL_LANDING_URL || DEFAULT_LANDING;
  const urlObj = new URL(landingBase);

  urlObj.searchParams.set('productId', link.product_id);
  urlObj.searchParams.set('linkCode', linkCode);
  urlObj.searchParams.set('partnerOrderNo', partnerOrderNo);
  urlObj.searchParams.set('notifyUrl', notifyUrl);
  urlObj.searchParams.set('env', env);
  if (externalOrderNo) {
    urlObj.searchParams.set('externalOrderNo', externalOrderNo);
  }

  const urlForSign = urlObj.toString();
  const { signature, nonceStr, timestamp } = await buildJsSdkSignature(urlForSign);
  const appId = getCurrentH5AppId();
  const hashParams = new URLSearchParams({
    signature,
    nonceStr,
    timestamp: String(timestamp),
    appId
  });

  return {
    signedUrl: `${urlForSign}#${hashParams.toString()}`,
    signature,
    nonceStr,
    timestamp,
    landingBase,
    appId
  };
}

async function generateUrlLink({ path, queryString, envVersion = 'release', expireInterval }) {
  const accessToken = await getMiniProgramAccessToken();
  const body = {
    path,
    env_version: envVersion
  };
  if (queryString) {
    body.query = queryString;
  }
  if (expireInterval) {
    body.is_expire = true;
    body.expire_type = 1; // interval seconds
    body.expire_interval = expireInterval;
  }

  const { data } = await axios.post(
    `https://api.weixin.qq.com/wxa/generate_urllink?access_token=${accessToken}`,
    body,
    { timeout: 8000 }
  );

  if (data.errcode) {
    throw new Error(`生成 URL Link 失败 (${data.errcode}): ${data.errmsg}`);
  }

  return data.url_link;
}

async function getMiniProgramAccessToken() {
  const now = Date.now();
  if (miniProgramTokenCache.accessToken && miniProgramTokenCache.expiresAt - now > 60_000) {
    return miniProgramTokenCache.accessToken;
  }

  const appId = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_SECRET;

  if (!appId || !secret) {
    throw new Error('缺少小程序 AppID/Secret（WECHAT_APPID/WECHAT_SECRET）');
  }

  const tokenUrl = 'https://api.weixin.qq.com/cgi-bin/token';
  const { data } = await axios.get(tokenUrl, {
    params: {
      grant_type: 'client_credential',
      appid: appId,
      secret
    },
    timeout: 8000
  });

  if (data.errcode) {
    throw new Error(`获取小程序 access_token 失败 (${data.errcode}): ${data.errmsg}`);
  }

  miniProgramTokenCache.accessToken = data.access_token;
  miniProgramTokenCache.expiresAt = now + (data.expires_in * 1000);
  return miniProgramTokenCache.accessToken;
}

/**
 * 测试API
 * GET /api/referral/test
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '测试API正常',
    data: {
      test: 'hello world'
    }
  });
});

/**
 * 获取引流商品信息
 * GET /api/referral/product
 */
router.get('/product', asyncHandler(async (req, res) => {
  try {
    const { linkCode } = req.query;
    
    if (!linkCode) {
      return error(res, '链接码不能为空', 400);
    }
    
    // 获取引流链接信息
    const links = await query(
      `SELECT rl.*, p.*, c.name as category_name
       FROM referral_links rl
       JOIN products p ON rl.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       WHERE rl.link_code = ? AND rl.status = 'active'`,
      [linkCode]
    );
    
    if (links.length === 0) {
      return error(res, '引流链接不存在或已失效', 404);
    }
    
    const link = links[0];
    
    // 检查商品状态
    if (link.status !== 1) {
      return error(res, '商品已下架', 400);
    }
    
    // 安全处理JSON字段
    let images = [];
    let tags = [];
    
    if (link.images) {
      try {
        if (typeof link.images === 'string') {
          images = JSON.parse(link.images);
        } else if (Array.isArray(link.images)) {
          images = link.images;
        }
      } catch (e) {
        console.warn('解析images失败，使用默认值:', e.message);
        images = [];
      }
    }
    
    if (link.tags) {
      try {
        if (typeof link.tags === 'string') {
          tags = JSON.parse(link.tags);
        } else if (Array.isArray(link.tags)) {
          tags = link.tags;
        }
      } catch (e) {
        console.warn('解析tags失败，使用默认值:', e.message);
        tags = [];
      }
    }
    
    const product = {
      id: link.product_id,
      name: link.name || '商品',
      description: link.description || '',
      image: link.image || '',
      images: images,
      price: parseFloat(link.price) || 0,
      originalPrice: link.original_price ? parseFloat(link.original_price) : null,
      stock: parseInt(link.stock) || 0,
      sales: parseInt(link.sales) || 0,
      cardPrice: link.card_price ? parseFloat(link.card_price) : null,
      cardStock: parseInt(link.card_stock) || 0,
      tags: tags,
      category: {
        id: link.category_id,
        name: link.category_name || '默认分类'
      }
    };
    
    success(res, {
      product,
      linkCode
    }, '获取引流商品信息成功');
    
  } catch (err) {
    console.error('获取引流商品信息失败:', err);
    error(res, '获取引流商品信息失败', 500, err.message);
  }
}));

/**
 * 创建引流订单
 * POST /api/referral/order
 */
router.post('/order', asyncHandler(async (req, res) => {
  try {
    const {
      linkCode,
      partnerOrderNo,
      notifyUrl,
      externalOrderNo,
      env = 'release'
    } = req.body;
    
    if (!linkCode || !partnerOrderNo || !notifyUrl) {
      return error(res, '参数不完整', 400);
    }
    
    // 验证引流链接
    const links = await query(
      'SELECT * FROM referral_links WHERE link_code = ? AND status = "active"',
      [linkCode]
    );
    
    if (links.length === 0) {
      return error(res, '引流链接不存在或已失效', 404);
    }
    
    const link = links[0];
    
    // 检查是否已存在相同的引流方订单号
    const existingOrders = await query(
      'SELECT * FROM referral_orders WHERE partner_order_no = ?',
      [partnerOrderNo]
    );
    
    if (existingOrders.length > 0) {
      return error(res, '引流方订单号已存在', 400);
    }
    
    // 创建引流订单记录
    await query(
      'INSERT INTO referral_orders (referral_link_id, partner_order_no, notify_url) VALUES (?, ?, ?)',
      [link.id, partnerOrderNo, notifyUrl]
    );

    const signedLink = await generateSignedLandingUrl(link, {
      linkCode,
      partnerOrderNo,
      notifyUrl,
      externalOrderNo,
      env
    });
    
    success(res, {
      linkCode,
      partnerOrderNo,
      notifyUrl,
      externalOrderNo: externalOrderNo || null,
      env,
      signedUrl: signedLink.signedUrl,
      signature: signedLink.signature,
      nonceStr: signedLink.nonceStr,
      timestamp: signedLink.timestamp,
      appId: signedLink.appId,
      landingBase: signedLink.landingBase
    }, '引流订单创建成功');
    
  } catch (err) {
    console.error('创建引流订单失败:', err);
    error(res, '创建引流订单失败', 500, err.message);
  }
}));

/**
 * 生成带签名的落地页链接（给引流方直接使用）
 * POST /api/referral/signed-link
 */
router.post('/signed-link', asyncHandler(async (req, res) => {
  const {
    linkCode,
    partnerOrderNo,
    notifyUrl,
    externalOrderNo,
    env = 'release'
  } = req.body || {};

  if (!linkCode || !partnerOrderNo || !notifyUrl) {
    return error(res, '参数不完整，必须包含 linkCode/partnerOrderNo/notifyUrl', 400);
  }

  // 验证引流链接有效
  const links = await query(
    'SELECT * FROM referral_links WHERE link_code = ? AND status = "active" LIMIT 1',
    [linkCode]
  );
  if (links.length === 0) {
    return error(res, '引流链接不存在或已失效', 404);
  }
  const link = links[0];

  try {
    const signedLink = await generateSignedLandingUrl(link, {
      linkCode,
      partnerOrderNo,
      notifyUrl,
      externalOrderNo,
      env
    });

    success(res, {
      signedUrl: signedLink.signedUrl,
      signature: signedLink.signature,
      nonceStr: signedLink.nonceStr,
      timestamp: signedLink.timestamp,
      appId: signedLink.appId,
      landingBase: signedLink.landingBase,
      linkCode,
      partnerOrderNo,
      notifyUrl,
      externalOrderNo: externalOrderNo || null,
      env
    }, '生成落地页签名链接成功');
  } catch (err) {
    console.error('生成落地页签名链接失败:', err.message || err);
    error(res, '生成微信JS-SDK签名失败，请检查凭证配置', 500, err.message);
  }
}));

/**
 * 生成 URL Link 直接唤起小程序（可用于非微信浏览器场景）
 * POST /api/referral/url-link
 */
router.post('/url-link', asyncHandler(async (req, res) => {
  const {
    linkCode,
    partnerOrderNo,
    notifyUrl
  } = req.body || {};

  if (!linkCode || !partnerOrderNo || !notifyUrl) {
    return error(res, '参数不完整，必须包含 linkCode/partnerOrderNo/notifyUrl', 400);
  }

  // 通过 linkCode 获取商品
  const links = await query(
    'SELECT * FROM referral_links WHERE link_code = ? AND status = "active" LIMIT 1',
    [linkCode]
  );
  if (links.length === 0) {
    return error(res, '引流链接不存在或已失效', 404);
  }
  const link = links[0];
  const productId = link.product_id;

  // 落库引流订单（url-link 之前没有写入 referral_orders，补齐，避免后续通知缺失）
  const existingOrders = await query(
    'SELECT id FROM referral_orders WHERE partner_order_no = ? LIMIT 1',
    [partnerOrderNo]
  );

  if (existingOrders.length === 0) {
    await query(
      'INSERT INTO referral_orders (referral_link_id, partner_order_no, notify_url) VALUES (?, ?, ?)',
      [link.id, partnerOrderNo, notifyUrl]
    );
    console.log(`创建引流订单记录: ${partnerOrderNo} -> referral_link_id ${link.id}`);
  } else {
    console.log(`引流订单已存在，复用: ${partnerOrderNo}`);
  }

  const miniProgramPath = buildMiniProgramPath({
    productId,
    linkCode,
    partnerOrderNo,
    notifyUrl,
    quantity: 1
  });

  try {
    const urlLink = await generateUrlLink({
      path: miniProgramPath.split('?')[0],
      queryString: miniProgramPath.includes('?') ? miniProgramPath.split('?')[1] : '',
      envVersion: 'release'
    });

    success(res, {
      urlLink,
      path: miniProgramPath.split('?')[0],
      query: miniProgramPath.includes('?') ? miniProgramPath.split('?')[1] : ''
    }, '生成 URL Link 成功');
  } catch (err) {
    console.error('生成 URL Link 失败:', err.message || err);
    error(res, err.message || '生成 URL Link 失败', 500);
  }
}));

module.exports = router;
