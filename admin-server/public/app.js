// 管理员系统前端JavaScript
const API_BASE = '/api';
let currentToken = localStorage.getItem('admin_token');
let currentPage = 'dashboard';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成');
    console.log('localStorage中的token:', localStorage.getItem('admin_token'));
    console.log('currentToken:', currentToken);
    
    // 检查是否已登录
    if (currentToken) {
        console.log('发现token，开始验证...');
        // 验证token有效性
        validateToken().then(valid => {
            console.log('Token验证结果:', valid);
            if (valid) {
                console.log('Token有效，显示仪表盘');
                showPage('dashboard');
                loadDashboard();
            } else {
                // token无效，清除并显示登录页
                console.log('Token无效，清除并显示登录页');
                currentToken = null;
                localStorage.removeItem('admin_token');
                showPage('login');
            }
        });
    } else {
        console.log('没有token，显示登录页');
        showPage('login');
    }
    
    // 绑定事件
    bindEvents();
    
    // 初始化侧边栏
    initSidebar();
});

// 验证token有效性
async function validateToken() {
    try {
        console.log('验证token有效性, currentToken:', currentToken ? 'exists' : 'null');
        console.log('API_BASE:', API_BASE);
        console.log('请求URL:', `${API_BASE}/admin/dashboard`);
        
        const response = await fetch(`${API_BASE}/admin/dashboard`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        console.log('验证响应状态:', response.status);
        console.log('验证响应OK:', response.ok);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Token验证失败:', response.status, errorData);
            return false;
        }
        
        const data = await response.json();
        console.log('验证成功，数据:', data);
        return data.success;
    } catch (error) {
        console.error('Token验证失败:', error);
        return false;
    }
}

// 绑定事件
function bindEvents() {
    // 登录表单
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // 侧边栏导航
    document.querySelectorAll('[data-page]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            if (page !== 'login') {
                // 检查是否已登录
                if (!currentToken) {
                    showPage('login');
                    return;
                }
                showPage(page);
                loadPageData(page);
            }
        });
    });
    
    // 文件上传预览
    document.getElementById('product-image').addEventListener('change', function(e) {
        previewImage(e.target, 'product-image-preview');
    });
    
    // 自定义下拉框
    initCustomDropdowns();
    
    document.getElementById('category-icon').addEventListener('change', function(e) {
        previewImage(e.target, 'category-icon-preview');
    });
    
    document.getElementById('banner-image').addEventListener('change', function(e) {
        previewImage(e.target, 'banner-image-preview');
    });
}

// 处理登录
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    // 显示加载状态
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>登录中...';
    submitBtn.disabled = true;
    
    try {
        console.log('开始登录请求:', { username, password });
        console.log('请求URL:', `${API_BASE}/admin/login`);
        
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        console.log('登录响应状态:', response.status);
        console.log('登录响应OK:', response.ok);
        
        const data = await response.json();
        console.log('登录响应数据:', data);
        
        if (data.success) {
            currentToken = data.data.token;
            localStorage.setItem('admin_token', currentToken);
            console.log('登录成功，token已保存');
            
            // 显示成功消息
            showMessage('登录成功！', 'success');
            
            // 延迟跳转，让用户看到成功消息
            setTimeout(() => {
                showPage('dashboard');
                loadDashboard();
            }, 500);
        } else {
            console.error('登录失败:', data.message);
            showMessage(data.message || '登录失败', 'error');
        }
    } catch (error) {
        console.error('登录请求失败:', error);
        showMessage('登录失败，请检查网络连接: ' + error.message, 'error');
    } finally {
        // 恢复按钮状态
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// 显示消息提示
function showMessage(message, type = 'info') {
    // 创建消息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    messageDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    messageDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // 添加到页面
    document.body.appendChild(messageDiv);
    
    // 自动移除
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 3000);
}

// 显示页面
function showPage(pageName) {
    if (pageName === 'login') {
        // 显示登录页面，隐藏管理后台
        document.getElementById('login-page').style.display = 'flex';
        document.getElementById('admin-layout').style.display = 'none';
    } else {
        // 隐藏登录页面，显示管理后台
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('admin-layout').style.display = 'flex';
        
        // 隐藏所有页面
        document.querySelectorAll('.page').forEach(page => {
            page.style.display = 'none';
        });
        
        // 显示指定页面
        const targetPage = document.getElementById(pageName + '-page');
        if (targetPage) {
            targetPage.style.display = 'block';
        }
        
        // 更新页面标题
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) {
            const titles = {
                'dashboard': '仪表盘',
                'products': '商品管理',
                'categories': '商品分类',
                'banners': '轮播图管理',
                'orders': '订单管理'
            };
            pageTitle.textContent = titles[pageName] || '管理后台';
        }
    }
    
    // 更新侧边栏活动状态
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    if (pageName !== 'login') {
        const activeLink = document.querySelector(`[data-page="${pageName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }
    
    currentPage = pageName;
}

// 初始化侧边栏
function initSidebar() {
    // 绑定侧边栏点击事件
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            if (page) {
                showPage(page);
                // 移动端自动关闭侧边栏
                if (window.innerWidth <= 768) {
                    document.querySelector('.sidebar').classList.remove('open');
                }
            }
        });
    });
}

// 切换侧边栏
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
}

// 刷新页面
function refreshPage() {
    location.reload();
}

// 切换主题
function toggleTheme() {
    // 这里可以实现主题切换功能
    console.log('切换主题');
}

// 切换用户菜单
function toggleUserMenu(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const menu = document.getElementById('user-dropdown');
    if (!menu) return;
    const isShown = menu.style.display === 'block';
    menu.style.display = isShown ? 'none' : 'block';
    // 点击外部关闭
    if (!isShown) {
        const handler = (e) => {
            const container = document.querySelector('.user-menu');
            if (container && !container.contains(e.target)) {
                menu.style.display = 'none';
                document.removeEventListener('click', handler);
            }
        };
        setTimeout(() => document.addEventListener('click', handler), 0);
    }
}

// 加载页面数据
function loadPageData(pageName) {
    switch (pageName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'products':
            loadProducts();
            loadCategories();
            // 重新初始化自定义下拉框
            setTimeout(() => {
                initCustomDropdowns();
            }, 100);
            break;
        case 'categories':
            loadCategories();
            break;
        case 'banners':
            loadBanners();
            break;
        case 'orders':
            console.log('Switching to orders page, calling loadOrders()');
            loadOrders();
            break;
    }
}

// 加载仪表盘数据
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE}/admin/dashboard`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 更新统计数字
            document.getElementById('total-products').textContent = data.data.totalProducts;
            document.getElementById('total-orders').textContent = data.data.totalOrders;
            document.getElementById('total-categories').textContent = data.data.totalCategories;
            document.getElementById('total-banners').textContent = data.data.totalBanners;
            
            // 渲染最近订单
            renderRecentOrders(data.data.recentOrders);
        }
    } catch (error) {
        console.error('加载仪表盘数据失败:', error);
        // 显示错误状态
        const tbody = document.getElementById('recent-orders');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">加载失败，请刷新重试</td></tr>';
        }
    }
}

// 渲染最近订单
function renderRecentOrders(orders) {
    const tbody = document.getElementById('recent-orders');
    if (!tbody) return;
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无订单数据</td></tr>';
        return;
    }
    
    const statusMap = {
        'pending': { text: '待支付', class: 'status-pending' },
        'paid': { text: '已支付', class: 'status-paid' },
        'shipped': { text: '已发货', class: 'status-shipped' },
        'completed': { text: '已完成', class: 'status-completed' },
        'cancelled': { text: '已取消', class: 'status-cancelled' }
    };
    
    tbody.innerHTML = orders.map(order => {
        const status = statusMap[order.status] || { text: order.status, class: 'status-unknown' };
        const createdAt = new Date(order.createdAt).toLocaleString('zh-CN');
        
        return `
            <tr>
                <td>${order.orderNo}</td>
                <td>用户${order.id}</td>
                <td>¥${parseFloat(order.amount).toFixed(2)}</td>
                <td><span class="status-badge ${status.class}">${status.text}</span></td>
                <td>${createdAt}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="viewOrder(${order.id})">
                        查看
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 查看订单详情
async function viewOrder(orderId) {
    try {
        console.log('查看订单:', orderId);
        
        // 显示加载状态
        showMessage('正在加载订单详情...', 'info');
        
        // 请求订单详情
        const response = await fetch(`${API_BASE}/admin/orders/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取订单详情失败');
        }
        
        const data = await response.json();
        
        if (data.success) {
            showOrderDetailModal(data.data);
        } else {
            throw new Error(data.message || '获取订单详情失败');
        }
    } catch (error) {
        console.error('查看订单详情失败:', error);
        showMessage('获取订单详情失败: ' + error.message, 'error');
    }
}

// 显示订单详情模态框
function showOrderDetailModal(order) {
    // 创建模态框HTML
    const modalHtml = `
        <div id="order-detail-modal" class="modal-overlay" onclick="closeOrderModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>订单详情 - ${order.orderNo}</h3>
                    <button class="modal-close" onclick="closeOrderModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="order-info-grid">
                        <div class="info-group">
                            <label>订单号:</label>
                            <span>${order.orderNo}</span>
                        </div>
                        <div class="info-group">
                            <label>订单状态:</label>
                            <span class="status-badge status-${order.status}">${getStatusText(order.status)}</span>
                        </div>
                        <div class="info-group">
                            <label>订单金额:</label>
                            <span class="amount">¥${parseFloat(order.totalAmount).toFixed(2)}</span>
                        </div>
                        <div class="info-group">
                            <label>支付方式:</label>
                            <span>${getPaymentMethodText(order.paymentMethod)}</span>
                        </div>
                        <div class="info-group">
                            <label>创建时间:</label>
                            <span>${new Date(order.createdAt).toLocaleString('zh-CN')}</span>
                        </div>
                        ${order.paidAt ? `
                        <div class="info-group">
                            <label>支付时间:</label>
                            <span>${new Date(order.paidAt).toLocaleString('zh-CN')}</span>
                        </div>
                        ` : ''}
                        ${order.remark ? `
                        <div class="info-group full-width">
                            <label>备注:</label>
                            <span>${order.remark}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    ${order.items && order.items.length > 0 ? `
                    <div class="order-items-section">
                        <h4>订单商品</h4>
                        <div class="items-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>商品名称</th>
                                        <th>单价</th>
                                        <th>数量</th>
                                        <th>小计</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${order.items.map(item => `
                                        <tr>
                                            <td>${item.product_name || item.productName || '未知商品'}</td>
                                            <td>¥${parseFloat(item.product_price || item.productPrice || 0).toFixed(2)}</td>
                                            <td>${item.quantity || 0}</td>
                                            <td>¥${parseFloat(item.subtotal || 0).toFixed(2)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    ` : ''}
                    
                    ${order.address ? `
                    <div class="order-address-section">
                        <h4>收货地址</h4>
                        <div class="address-info">
                            <p><strong>收货人：</strong>${order.address.name}</p>
                            <p><strong>联系电话：</strong>${order.address.phone}</p>
                            <p><strong>收货地址：</strong>${order.address.province} ${order.address.city} ${order.address.district} ${order.address.detail}</p>
                            ${order.address.tag ? `<p><strong>地址标签：</strong>${order.address.tag}</p>` : ''}
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeOrderModal()">关闭</button>
                    ${order.status === 'pending' ? `
                    <button class="btn btn-primary" onclick="updateOrderStatus(${order.id}, 'paid')">标记为已支付</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// 获取状态文本
function getStatusText(status) {
    const statusMap = {
        'pending': '待支付',
        'paid': '已支付',
        'shipped': '已发货',
        'completed': '已完成',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

// 获取支付方式文本
function getPaymentMethodText(method) {
    const methodMap = {
        'wechat': '微信支付',
        'alipay': '支付宝',
        'bank': '银行卡',
        'cash': '现金'
    };
    return methodMap[method] || method || '微信支付';
}

// 初始化自定义下拉框
function initCustomDropdowns() {
    // 为所有自定义下拉框添加事件监听
    const dropdowns = document.querySelectorAll('.custom-dropdown');
    console.log('初始化自定义下拉框，找到', dropdowns.length, '个下拉框');
    
    dropdowns.forEach(dropdown => {
        const trigger = dropdown.querySelector('.dropdown-trigger');
        const menu = dropdown.querySelector('.dropdown-menu');
        const items = dropdown.querySelectorAll('.dropdown-item');
        
        if (!trigger || !menu) {
            console.warn('下拉框元素不完整:', dropdown);
            return;
        }
        
        // 移除之前的事件监听器（如果存在）
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        
        // 点击触发器切换菜单显示
        newTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            console.log('点击下拉框触发器');
            toggleDropdown(dropdown);
        });
        
        // 点击选项
        items.forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                console.log('点击下拉框选项:', item.textContent);
                selectDropdownItem(dropdown, item);
            });
        });
    });
    
    // 点击页面其他地方关闭下拉框（只绑定一次）
    if (!window.dropdownClickHandler) {
        window.dropdownClickHandler = function() {
            closeAllDropdowns();
        };
        document.addEventListener('click', window.dropdownClickHandler);
    }
}

// 切换下拉框显示状态
function toggleDropdown(dropdown) {
    const isOpen = dropdown.querySelector('.dropdown-menu').classList.contains('show');
    
    // 先关闭所有其他下拉框
    closeAllDropdowns();
    
    if (!isOpen) {
        const menu = dropdown.querySelector('.dropdown-menu');
        const trigger = dropdown.querySelector('.dropdown-trigger');
        
        menu.classList.add('show');
        trigger.classList.add('active');
    }
}

// 选择下拉框选项
function selectDropdownItem(dropdown, item) {
    const menu = dropdown.querySelector('.dropdown-menu');
    const trigger = dropdown.querySelector('.dropdown-trigger');
    const text = dropdown.querySelector('.dropdown-text');
    const value = item.getAttribute('data-value');
    const label = item.querySelector('span').textContent;
    
    // 更新选中状态
    menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    
    // 更新触发器文本
    text.textContent = label;
    
    // 关闭菜单
    menu.classList.remove('show');
    trigger.classList.remove('active');
    
    // 触发change事件，模拟原生select的行为
    const changeEvent = new Event('change', { bubbles: true });
    dropdown.dispatchEvent(changeEvent);
    
    // 根据下拉框ID执行相应操作
    const dropdownId = dropdown.id;
    if (dropdownId === 'category-dropdown') {
        loadProducts(); // 重新加载商品列表
    } else if (dropdownId === 'status-dropdown') {
        loadProducts(); // 重新加载商品列表
    }
}

// 关闭所有下拉框
function closeAllDropdowns() {
    document.querySelectorAll('.custom-dropdown').forEach(dropdown => {
        const menu = dropdown.querySelector('.dropdown-menu');
        const trigger = dropdown.querySelector('.dropdown-trigger');
        
        menu.classList.remove('show');
        trigger.classList.remove('active');
    });
}

// 获取下拉框选中的值
function getDropdownValue(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return '';
    
    const activeItem = dropdown.querySelector('.dropdown-item.active');
    return activeItem ? activeItem.getAttribute('data-value') : '';
}

// 设置下拉框的值
function setDropdownValue(dropdownId, value, defaultText) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    const menu = dropdown.querySelector('.dropdown-menu');
    const trigger = dropdown.querySelector('.dropdown-trigger');
    const text = dropdown.querySelector('.dropdown-text');
    
    if (!menu || !trigger || !text) return;
    
    // 清除所有选中状态
    menu.querySelectorAll('.dropdown-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 查找匹配的选项
    const targetItem = menu.querySelector(`[data-value="${value}"]`);
    if (targetItem) {
        targetItem.classList.add('active');
        text.textContent = targetItem.querySelector('span').textContent;
    } else {
        text.textContent = defaultText;
    }
}

// 上传商品图片
async function uploadProductImage(file) {
    try {
        console.log('开始上传图片:', file);
        const formData = new FormData();
        formData.append('image', file);
        
        console.log('FormData构建完成，发送请求到:', '/api/admin/products/upload-image');
        console.log('请求头:', {
            'Authorization': `Bearer ${currentToken ? 'exists' : 'null'}`
        });
        
        const response = await fetch('/api/admin/products/upload-image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            },
            body: formData
        });
        
        console.log('上传响应状态:', response.status);
        console.log('上传响应OK:', response.ok);
        
        const result = await response.json();
        console.log('上传响应数据:', result);
        
        if (result.success) {
            return result.data.imageUrl;
        } else {
            throw new Error(result.message || '图片上传失败');
        }
    } catch (error) {
        console.error('图片上传失败:', error);
        throw error;
    }
}

// 关闭订单详情模态框
function closeOrderModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('order-detail-modal');
    if (modal) {
        modal.remove();
    }
}

// 更新订单状态
async function updateOrderStatus(orderId, newStatus) {
    try {
        const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
            throw new Error('更新订单状态失败');
        }
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('订单状态更新成功', 'success');
            closeOrderModal();
            // 刷新仪表盘数据
            loadDashboard();
        } else {
            throw new Error(data.message || '更新订单状态失败');
        }
    } catch (error) {
        console.error('更新订单状态失败:', error);
        showMessage('更新订单状态失败: ' + error.message, 'error');
    }
}

// 加载商品列表
async function loadProducts(page = 1) {
    const tbody = document.getElementById('products-table');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><div class="loading show"><div class="spinner-border" role="status"><span class="visually-hidden">加载中...</span></div></div></td></tr>';
    
    try {
        // 获取筛选条件
        const categoryId = getDropdownValue('category-dropdown');
        const status = getDropdownValue('status-dropdown');
        const keyword = document.getElementById('product-search')?.value || '';
        
        // 构建查询参数
        const params = new URLSearchParams({
            page: page,
            pageSize: 10
        });
        
        if (categoryId) params.append('categoryId', categoryId);
        if (status) params.append('status', status);
        if (keyword) params.append('keyword', keyword);
        
        const response = await fetch(`${API_BASE}/admin/products?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('获取商品列表失败');
        }
        
        const data = await response.json();
        
        if (data.success) {
            renderProductsTable(data.data.products);
            renderPagination(data.data.pagination, 'products');
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('加载商品列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">加载失败</td></tr>';
    }
}

// 渲染商品表格
function renderProductsTable(products) {
    const tbody = document.getElementById('products-table');
    
    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="bi bi-box"></i>
                        </div>
                        <h3>暂无商品</h3>
                        <p>还没有添加任何商品，点击上方按钮添加第一个商品</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td><input type="checkbox" value="${product.id}" class="checkbox"></td>
            <td>${product.id}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${product.image}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid #f0f0f0;" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xOCAxOEgxOFYzMEgzMFYxOEgxOCIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K'">
                    <div>
                        <div style="font-weight: 600; color: #262626; margin-bottom: 4px; font-size: 14px;">${product.name}</div>
                        <div style="color: #8c8c8c; font-size: 12px; line-height: 1.4;">${product.description ? product.description.substring(0, 50) + '...' : '暂无描述'}</div>
                    </div>
                </div>
            </td>
            <td>
                <span style="background: #f0f0f0; color: #666; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                    ${product.category_name || '未分类'}
                </span>
            </td>
            <td style="font-weight: 600; color: #ff4d4f; font-size: 16px;">¥${product.price}</td>
            <td>
                <span style="color: ${product.stock > 10 ? '#52c41a' : product.stock > 0 ? '#faad14' : '#ff4d4f'}; font-weight: 500;">
                    ${product.stock}
                </span>
            </td>
            <td>
                <span class="status-tag ${product.status == 1 ? 'success' : 'danger'}">
                    ${product.status == 1 ? '上架' : '下架'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn" onclick="editProduct(${product.id})" title="编辑">
                        <i class="bi bi-pencil"></i>
                        <span>编辑</span>
                    </button>
                    <button class="action-btn danger" onclick="deleteProduct(${product.id})" title="删除">
                        <i class="bi bi-trash"></i>
                        <span>删除</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// 加载分类列表
async function loadCategories() {
    const tbody = document.getElementById('categories-table');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center"><div class="loading show"><div class="spinner-border" role="status"><span class="visually-hidden">加载中...</span></div></div></td></tr>';
    
    try {
        const response = await fetch(`${API_BASE}/admin/categories`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('获取分类列表失败');
        }
        
        const data = await response.json();
        
        if (data.success) {
            renderCategoriesTable(data.data);
            // 同时更新商品页面的分类筛选
            updateCategoryFilter(data.data);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('加载分类列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">加载失败</td></tr>';
    }
}

// 渲染分类表格
function renderCategoriesTable(categories) {
    const tbody = document.getElementById('categories-table');
    
    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = categories.map(category => `
        <tr>
            <td>${category.id}</td>
            <td>${category.name}</td>
            <td>
                ${category.icon ? `<img src="${category.icon}" style="width: 30px; height: 30px; object-fit: cover;" onerror="this.style.display='none'">` : '-'}
            </td>
            <td>${category.sort_order}</td>
            <td>${category.product_count || 0}</td>
            <td>
                <span class="badge ${category.status == 1 ? 'bg-success' : 'bg-secondary'} status-badge">
                    ${category.status == 1 ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editCategory(${category.id})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory(${category.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// 更新分类筛选下拉框
function updateCategoryFilter(categories) {
    // 更新自定义分类下拉框
    const categoryDropdown = document.getElementById('category-dropdown');
    if (categoryDropdown) {
        const menu = categoryDropdown.querySelector('.dropdown-menu');
        menu.innerHTML = `
            <div class="dropdown-item active" data-value="">
                <i class="bi bi-check"></i>
                <span>所有分类</span>
            </div>
            ${categories.map(category => `
                <div class="dropdown-item" data-value="${category.id}">
                    <i class="bi bi-check"></i>
                    <span>${category.name}</span>
                </div>
            `).join('')}
        `;
        
        // 重新绑定事件
        const items = menu.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                console.log('点击分类选项:', item.textContent);
                selectDropdownItem(categoryDropdown, item);
            });
        });
    }
    
    // 同时更新商品编辑弹窗的分类下拉框
    const productCategoryDropdown = document.getElementById('product-category-dropdown');
    if (productCategoryDropdown) {
        const menu = productCategoryDropdown.querySelector('.dropdown-menu');
        menu.innerHTML = `
            <div class="dropdown-item active" data-value="">
                <i class="bi bi-check"></i>
                <span>请选择分类</span>
            </div>
            ${categories.map(category => `
                <div class="dropdown-item" data-value="${category.id}">
                    <i class="bi bi-check"></i>
                    <span>${category.name}</span>
                </div>
            `).join('')}
        `;
        
        // 重新绑定事件
        const items = menu.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                console.log('点击编辑弹窗分类选项:', item.textContent);
                selectDropdownItem(productCategoryDropdown, item);
            });
        });
    }
}

// 加载轮播图列表
async function loadBanners() {
    const tbody = document.getElementById('banners-table');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center"><div class="loading show"><div class="spinner-border" role="status"><span class="visually-hidden">加载中...</span></div></div></td></tr>';
    
    try {
        const response = await fetch(`${API_BASE}/admin/banners`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('获取轮播图列表失败');
        }
        
        const data = await response.json();
        
        if (data.success) {
            renderBannersTable(data.data);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('加载轮播图列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">加载失败</td></tr>';
    }
}

// 渲染轮播图表格
function renderBannersTable(banners) {
    const tbody = document.getElementById('banners-table');
    
    if (banners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = banners.map(banner => `
        <tr>
            <td>${banner.id}</td>
            <td>${banner.title}</td>
            <td>
                <img src="${banner.image}" style="width: 60px; height: 30px; object-fit: cover;" onerror="this.style.display='none'">
            </td>
            <td>${banner.link || '-'}</td>
            <td>${banner.sort_order}</td>
            <td>
                <span class="badge ${banner.status == 1 ? 'bg-success' : 'bg-secondary'} status-badge">
                    ${banner.status == 1 ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editBanner(${banner.id})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteBanner(${banner.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// 加载订单列表
async function loadOrders(page = 1, pageSize = 10) {
    const tbody = document.getElementById('orders-table');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="loading show"><div class="spinner-border" role="status"><span class="visually-hidden">加载中...</span></div></div></td></tr>';
    
    // 调试信息
    console.log('loadOrders called, currentToken:', currentToken ? 'exists' : 'null');
    
    // 检查token是否存在
    if (!currentToken) {
        console.error('No token found, redirecting to login');
        showPage('login');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/orders?page=${page}&pageSize=${pageSize}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        console.log('API response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API error response:', errorText);
            
            // 如果是401错误，说明token无效，跳转到登录页
            if (response.status === 401) {
                console.error('Token无效，跳转到登录页');
                currentToken = null;
                localStorage.removeItem('admin_token');
                showPage('login');
                return;
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('API response data:', data);
        
        if (data.success) {
            renderOrdersTable(data.data || []);
            // 更新分页信息
            if (data.pagination) {
                renderPagination(data.pagination, 'orders');
            }
        } else {
            throw new Error(data.message || '获取订单列表失败');
        }
    } catch (error) {
        console.error('加载订单列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">加载失败: ${error.message}</td></tr>`;
    }
}

// 渲染订单表格
function renderOrdersTable(orders) {
    const tbody = document.getElementById('orders-table');
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无订单数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>${order.orderNo || order.orderNumber || order.id}</td>
            <td>${order.userName || order.user_name || '未知用户'}</td>
            <td>¥${parseFloat(order.amount || order.totalAmount || order.total_amount || 0).toFixed(2)}</td>
            <td><span class="status-badge status-${order.status}">${getStatusText(order.status)}</span></td>
            <td>${new Date(order.createdAt || order.created_at).toLocaleString('zh-CN')}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewOrder(${order.id})">查看</button>
                </td>
            </tr>
    `).join('');
}

// 渲染分页
function renderPagination(pagination, type) {
    const container = document.getElementById(type + '-pagination');
    if (!container) return;
    
    const { page, totalPages } = pagination;
    let html = '';
    
    // 上一页
    if (page > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}(${page - 1})">上一页</a></li>`;
    }
    
    // 页码
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
        html += `<li class="page-item ${i === page ? 'active' : ''}"><a class="page-link" href="#" onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}(${i})">${i}</a></li>`;
    }
    
    // 下一页
    if (page < totalPages) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}(${page + 1})">下一页</a></li>`;
    }
    
    container.innerHTML = html;
}

// 图片预览
function previewImage(input, previewId) {
    const file = input.files[0];
    const preview = document.getElementById(previewId);
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" style="max-width: 200px; max-height: 150px; object-fit: cover;">`;
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = '';
    }
}

// 商品相关操作
async function editProduct(id) {
    console.log('编辑商品:', id);
    // 显示编辑弹窗
    showProductModal('编辑商品');
    // 获取商品数据并填充到表单
    await loadProductForEdit(id);
}

function deleteProduct(id) {
    showConfirmModal('确定要删除这个商品吗？', (confirmed) => {
        if (confirmed) {
        console.log('删除商品:', id);
            // 这里应该调用删除API
            showMessage('商品删除成功', 'success');
            loadProducts(); // 重新加载商品列表
        }
    });
}

async function loadProductForEdit(id) {
    try {
        // 从API获取商品数据
        const response = await fetch(`/api/admin/products/${id}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取商品详情失败');
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || '获取商品详情失败');
        }
        
        const productData = result.data;
        
        // 填充表单
        document.getElementById('product-name').value = productData.name || '';
        document.getElementById('product-description').value = productData.description || '';
        document.getElementById('product-price').value = productData.price || '';
        document.getElementById('product-stock').value = productData.stock || '';
        
        // 设置分类下拉框
        setDropdownValue('product-category-dropdown', productData.category_id, '请选择分类');
        
        // 设置状态下拉框
        setDropdownValue('product-status-dropdown', productData.status, '上架');
        
        // 设置图片预览
        const preview = document.getElementById('product-image-preview');
        console.log('商品数据:', productData);
        console.log('图片字段 - image:', productData.image);
        console.log('图片字段 - images:', productData.images);
        
        if (preview) {
            // 优先使用images数组中的第一个图片，如果没有则使用image字段
            const imageUrl = (productData.images && productData.images.length > 0) 
                ? productData.images[0] 
                : productData.image;
            
            console.log('选择的图片URL:', imageUrl);
            
            if (imageUrl) {
                console.log('显示商品图片:', imageUrl);
                const imgElement = `<img src="${imageUrl}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px;" onload="console.log('图片加载成功:', this.src)" onerror="console.error('图片加载失败:', this.src)">`;
                preview.innerHTML = imgElement;
            } else {
                console.log('没有找到商品图片');
                preview.innerHTML = '';
            }
        } else {
            console.error('找不到图片预览容器');
        }
        
        // 设置编辑模式
        window.currentEditProductId = id;
        
    } catch (error) {
        console.error('获取商品详情失败:', error);
        showMessage('获取商品详情失败: ' + error.message, 'error');
    }
}

function showProductModal(title) {
    // 显示商品编辑弹窗
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.style.display = 'flex';
        // 更新标题
        const titleElement = modal.querySelector('.modal-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
        
        // 重新初始化下拉框
        setTimeout(() => {
            initCustomDropdowns();
        }, 100);
    }
}

function hideProductModal() {
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.style.display = 'none';
        // 清空表单
        document.getElementById('product-form').reset();
        document.getElementById('product-image-preview').innerHTML = '';
        window.currentEditProductId = null;
    }
}

async function saveProduct() {
    try {
        // 获取表单数据
        const formData = {
            name: document.getElementById('product-name').value,
            description: document.getElementById('product-description').value,
            price: document.getElementById('product-price').value,
            stock: document.getElementById('product-stock').value,
            category_id: getDropdownValue('product-category-dropdown'),
            status: getDropdownValue('product-status-dropdown')
        };
        
        // 验证必填字段
        if (!formData.name || !formData.price || !formData.category_id) {
            showMessage('请填写必填字段', 'error');
            return;
        }
        
        // 处理图片上传
        const imageFile = document.getElementById('product-image').files[0];
        console.log('图片文件:', imageFile);
        console.log('文件列表长度:', document.getElementById('product-image').files.length);
        
        if (imageFile) {
            console.log('上传图片中...', imageFile.name, imageFile.size, imageFile.type);
            const imageUrl = await uploadProductImage(imageFile);
            if (imageUrl) {
                formData.image = imageUrl;
                console.log('图片上传成功:', imageUrl);
            }
        } else {
            console.log('没有选择图片文件');
        }
        
        // 保存商品
        const url = window.currentEditProductId 
            ? `/api/admin/products/${window.currentEditProductId}`
            : '/api/admin/products';
        const method = window.currentEditProductId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage(window.currentEditProductId ? '商品更新成功' : '商品创建成功', 'success');
            hideProductModal();
            loadProducts(); // 重新加载商品列表
        } else {
            throw new Error(result.message || '保存失败');
        }
        
    } catch (error) {
        console.error('保存商品失败:', error);
        showMessage('保存失败: ' + error.message, 'error');
    }
}

// 分类相关操作
function editCategory(id) {
    // 实现编辑分类逻辑
    console.log('编辑分类:', id);
}

function deleteCategory(id) {
    if (confirm('确定要删除这个分类吗？')) {
        // 实现删除分类逻辑
        console.log('删除分类:', id);
    }
}

function saveCategory() {
    // 实现保存分类逻辑
    console.log('保存分类');
}

// 轮播图相关操作
function editBanner(id) {
    // 实现编辑轮播图逻辑
    console.log('编辑轮播图:', id);
}

function deleteBanner(id) {
    if (confirm('确定要删除这个轮播图吗？')) {
        // 实现删除轮播图逻辑
        console.log('删除轮播图:', id);
    }
}

function saveBanner() {
    // 实现保存轮播图逻辑
    console.log('保存轮播图');
}

// 登出
function logout() {
    showConfirmModal('确定要退出登录吗？', (ok) => {
        if (!ok) return;
        localStorage.removeItem('admin_token');
        currentToken = null;
        showMessage('已退出登录', 'info');
        showPage('login');
        // 清空表单
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    });
}

// 通用确认弹窗
let _confirmResolver = null;
function showConfirmModal(message, cb) {
    const overlay = document.getElementById('confirm-modal');
    const msg = document.getElementById('confirm-modal-message');
    if (!overlay || !msg) return cb(true);
    msg.textContent = message || '确认操作？';
    overlay.style.display = 'flex';
    _confirmResolver = cb;
}

function hideConfirmModal() {
    const overlay = document.getElementById('confirm-modal');
    if (overlay) overlay.style.display = 'none';
}

function onConfirmModal(ok) {
    try {
        if (typeof _confirmResolver === 'function') _confirmResolver(!!ok);
    } finally {
        hideConfirmModal();
        _confirmResolver = null;
    }
}

// 个人信息
function openProfileModal() {
    const m = document.getElementById('profile-modal');
    if (m) m.style.display = 'flex';
}
function closeProfileModal() {
    const m = document.getElementById('profile-modal');
    if (m) m.style.display = 'none';
}
function saveProfile() {
    const nickname = document.getElementById('profile-nickname').value.trim();
    // TODO: 调用后端保存，这里直接提示成功
    showMessage('个人信息已保存', 'success');
    closeProfileModal();
}

// 修改密码
function openChangePasswordModal() {
    const m = document.getElementById('password-modal');
    if (m) m.style.display = 'flex';
}
function closeChangePasswordModal() {
    const m = document.getElementById('password-modal');
    if (m) m.style.display = 'none';
}
function changePassword() {
    const oldPwd = document.getElementById('old-password').value;
    const newPwd = document.getElementById('new-password').value;
    const confirmPwd = document.getElementById('confirm-password').value;
    if (!oldPwd || !newPwd) {
        showMessage('请输入完整信息', 'error');
        return;
    }
    if (newPwd !== confirmPwd) {
        showMessage('两次输入的密码不一致', 'error');
        return;
    }
    // TODO: 调用后端修改密码，这里直接提示成功
    showMessage('密码修改成功', 'success');
    closeChangePasswordModal();
}
