// 管理员系统前端JavaScript
const API_BASE = '/api';
let currentToken = localStorage.getItem('admin_token');
let currentPage = 'dashboard';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否已登录
    if (currentToken) {
        // 验证token有效性
        validateToken().then(valid => {
            if (valid) {
                showPage('dashboard');
                loadDashboard();
            } else {
                // token无效，清除并显示登录页
                currentToken = null;
                localStorage.removeItem('admin_token');
                showPage('login');
            }
        });
    } else {
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
        const response = await fetch(`${API_BASE}/admin/dashboard`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        return response.ok;
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
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentToken = data.data.token;
            localStorage.setItem('admin_token', currentToken);
            
            // 显示成功消息
            showMessage('登录成功！', 'success');
            
            // 延迟跳转，让用户看到成功消息
            setTimeout(() => {
                showPage('dashboard');
                loadDashboard();
            }, 500);
        } else {
            showMessage(data.message || '登录失败', 'error');
        }
    } catch (error) {
        console.error('登录失败:', error);
        showMessage('登录失败，请检查网络连接', 'error');
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
function toggleUserMenu() {
    // 这里可以实现用户菜单功能
    console.log('切换用户菜单');
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
            break;
        case 'categories':
            loadCategories();
            break;
        case 'banners':
            loadBanners();
            break;
        case 'orders':
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
            document.getElementById('total-products').textContent = data.data.totalProducts;
            document.getElementById('total-orders').textContent = data.data.totalOrders;
            document.getElementById('total-categories').textContent = data.data.totalCategories;
            document.getElementById('total-banners').textContent = data.data.totalBanners;
        }
    } catch (error) {
        console.error('加载仪表盘数据失败:', error);
    }
}

// 加载商品列表
async function loadProducts(page = 1) {
    const tbody = document.getElementById('products-table');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><div class="loading show"><div class="spinner-border" role="status"><span class="visually-hidden">加载中...</span></div></div></td></tr>';
    
    try {
        const response = await fetch(`${API_BASE}/admin/products?page=${page}&pageSize=10`, {
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
                    </button>
                    <button class="action-btn danger" onclick="deleteProduct(${product.id})" title="删除">
                        <i class="bi bi-trash"></i>
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
    const select = document.getElementById('category-filter');
    if (select) {
        select.innerHTML = '<option value="">所有分类</option>' + 
            categories.map(category => `<option value="${category.id}">${category.name}</option>`).join('');
    }
    
    // 同时更新商品表单的分类选择
    const productSelect = document.getElementById('product-category');
    if (productSelect) {
        productSelect.innerHTML = '<option value="">请选择分类</option>' + 
            categories.map(category => `<option value="${category.id}">${category.name}</option>`).join('');
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
async function loadOrders() {
    const tbody = document.getElementById('orders-table');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="loading show"><div class="spinner-border" role="status"><span class="visually-hidden">加载中...</span></div></div></td></tr>';
    
    try {
        // 这里应该调用订单API，暂时显示模拟数据
        tbody.innerHTML = `
            <tr>
                <td>ML202501190001</td>
                <td>用户001</td>
                <td>¥999.00</td>
                <td><span class="badge bg-warning">待付款</span></td>
                <td>2025-01-19 10:30:00</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary">查看</button>
                </td>
            </tr>
        `;
    } catch (error) {
        console.error('加载订单列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">加载失败</td></tr>';
    }
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
function editProduct(id) {
    // 实现编辑商品逻辑
    console.log('编辑商品:', id);
}

function deleteProduct(id) {
    if (confirm('确定要删除这个商品吗？')) {
        // 实现删除商品逻辑
        console.log('删除商品:', id);
    }
}

function saveProduct() {
    // 实现保存商品逻辑
    console.log('保存商品');
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
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('admin_token');
        currentToken = null;
        showMessage('已退出登录', 'info');
        showPage('login');
        
        // 清空表单
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }
}
