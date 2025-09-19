// 管理员系统前端JavaScript
const API_BASE = 'http://localhost:3000/api';
let currentToken = localStorage.getItem('admin_token');
let currentPage = 'dashboard';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否已登录
    if (currentToken) {
        showPage('dashboard');
        loadDashboard();
    } else {
        showPage('login');
    }
    
    // 绑定事件
    bindEvents();
});

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
    
    try {
        // 这里应该调用真实的登录API
        // 为了演示，我们使用模拟登录
        if (username === 'admin' && password === 'admin123') {
            currentToken = 'mock_admin_token_' + Date.now();
            localStorage.setItem('admin_token', currentToken);
            showPage('dashboard');
            loadDashboard();
        } else {
            alert('用户名或密码错误');
        }
    } catch (error) {
        console.error('登录失败:', error);
        alert('登录失败，请重试');
    }
}

// 显示页面
function showPage(pageName) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = 'none';
    });
    
    // 隐藏登录页面
    document.getElementById('login-page').style.display = 'none';
    
    // 显示指定页面
    if (pageName === 'login') {
        document.getElementById('login-page').style.display = 'block';
    } else {
        document.getElementById(pageName + '-page').style.display = 'block';
    }
    
    // 更新侧边栏活动状态
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-page="${pageName}"]`).classList.add('active');
    
    currentPage = pageName;
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
        // 模拟数据，实际应该调用API
        document.getElementById('total-products').textContent = '156';
        document.getElementById('total-orders').textContent = '1,234';
        document.getElementById('total-categories').textContent = '12';
        document.getElementById('total-banners').textContent = '5';
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
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td><input type="checkbox" value="${product.id}"></td>
            <td>${product.id}</td>
            <td>
                <div class="d-flex align-items-center">
                    <img src="${product.image}" class="me-2" style="width: 40px; height: 40px; object-fit: cover;" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNiAxNkgxNlYyNEgyNFYxNkgxNloiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+Cg=='">
                    <div>
                        <div class="fw-bold">${product.name}</div>
                        <small class="text-muted">${product.description || ''}</small>
                    </div>
                </div>
            </td>
            <td>${product.category_name || '-'}</td>
            <td>¥${product.price}</td>
            <td>${product.stock}</td>
            <td>
                <span class="badge ${product.status == 1 ? 'bg-success' : 'bg-secondary'} status-badge">
                    ${product.status == 1 ? '上架' : '下架'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editProduct(${product.id})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct(${product.id})">
                    <i class="bi bi-trash"></i>
                </button>
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
    select.innerHTML = '<option value="">所有分类</option>' + 
        categories.map(category => `<option value="${category.id}">${category.name}</option>`).join('');
    
    // 同时更新商品表单的分类选择
    const productSelect = document.getElementById('product-category');
    productSelect.innerHTML = '<option value="">请选择分类</option>' + 
        categories.map(category => `<option value="${category.id}">${category.name}</option>`).join('');
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
    localStorage.removeItem('admin_token');
    currentToken = null;
    showPage('login');
}
