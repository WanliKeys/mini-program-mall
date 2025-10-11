#!/bin/bash

# 商城Docker部署脚本
# 使用方法: ./deploy.sh [选项]
# 选项:
#   --init     首次部署，初始化所有服务
#   --update   更新应用
#   --stop     停止所有服务
#   --restart  重启所有服务
#   --logs     查看日志
#   --backup   备份数据库
#   --restore  恢复数据库

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查Docker和Docker Compose
check_dependencies() {
    log_info "检查系统依赖..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi

    log_success "系统依赖检查通过"
}

# 检查环境配置文件
check_env_files() {
    log_info "检查环境配置文件..."

    if [ ! -f ".env" ]; then
        if [ -f ".env.production" ]; then
            cp .env.production .env
            log_info "已复制生产环境配置文件"
        else
            log_error "未找到.env文件，请先配置环境变量"
            exit 1
        fi
    fi

    log_success "环境配置文件检查通过"
}

# 创建必要的目录
create_directories() {
    log_info "创建必要的目录..."

    mkdir -p nginx/ssl
    mkdir -p backups
    mkdir -p logs

    log_success "目录创建完成"
}

# 初始化部署
init_deploy() {
    log_info "开始初始化部署..."

    check_dependencies
    check_env_files
    create_directories

    # 停止可能运行的容器
    docker-compose down -v 2>/dev/null || true

    # 构建并启动服务
    log_info "构建Docker镜像..."
    docker-compose build --no-cache

    log_info "启动服务..."
    docker-compose up -d

    # 等待服务启动
    log_info "等待服务启动..."
    sleep 30

    # 检查服务状态
    check_services

    log_success "初始化部署完成！"
    show_service_info
}

# 更新应用
update_app() {
    log_info "开始更新应用..."

    check_dependencies

    # 备份当前数据
    backup_database

    # 拉取最新代码
    log_info "拉取最新代码..."
    git pull

    # 重新构建并启动
    log_info "重新构建应用..."
    docker-compose build --no-cache

    log_info "重启服务..."
    docker-compose up -d

    # 等待服务启动
    sleep 20
    check_services

    log_success "应用更新完成！"
}

# 停止服务
stop_services() {
    log_info "停止所有服务..."
    docker-compose down
    log_success "所有服务已停止"
}

# 重启服务
restart_services() {
    log_info "重启所有服务..."
    docker-compose restart
    sleep 10
    check_services
    log_success "所有服务已重启"
}

# 查看日志
show_logs() {
    log_info "显示服务日志..."
    docker-compose logs -f --tail=100
}

# 检查服务状态
check_services() {
    log_info "检查服务状态..."

    # 检查容器状态
    containers=("mall_mysql" "mall_redis" "mall_backend" "mall_admin" "mall_nginx")

    for container in "${containers[@]}"; do
        if docker ps | grep -q "$container"; then
            log_success "$container 运行正常"
        else
            log_error "$container 未运行"
            docker logs "$container" --tail=20
        fi
    done

    # 检查健康状态
    log_info "检查服务健康状态..."

    # 检查后端API
    if curl -f http://localhost:3000/health &>/dev/null; then
        log_success "后端API服务正常"
    else
        log_error "后端API服务异常"
    fi

    # 检查管理后台
    if curl -f http://localhost:3001 &>/dev/null; then
        log_success "管理后台服务正常"
    else
        log_error "管理后台服务异常"
    fi
}

# 显示服务信息
show_service_info() {
    echo
    log_success "========== 部署完成 =========="
    echo "后端API地址: http://localhost:3000"
    echo "管理后台地址: http://localhost:3001"
    echo "Nginx代理地址: http://localhost:80"
    echo
    echo "常用命令:"
    echo "  查看日志: ./deploy.sh --logs"
    echo "  重启服务: ./deploy.sh --restart"
    echo "  停止服务: ./deploy.sh --stop"
    echo "  备份数据: ./deploy.sh --backup"
    echo
    echo "Docker命令:"
    echo "  查看容器状态: docker ps"
    echo "  查看容器日志: docker logs [容器名]"
    echo "  进入容器: docker exec -it [容器名] sh"
    echo "================================"
}

# 备份数据库
backup_database() {
    log_info "备份数据库..."

    backup_file="backups/mall_db_$(date +%Y%m%d_%H%M%S).sql"

    docker exec mall_mysql mysqldump \
        -u root \
        -p${MYSQL_ROOT_PASSWORD} \
        --single-transaction \
        --routines \
        --triggers \
        mall_db > "$backup_file"

    gzip "$backup_file"

    log_success "数据库备份完成: ${backup_file}.gz"
}

# 恢复数据库
restore_database() {
    if [ -z "$1" ]; then
        log_error "请指定备份文件: ./deploy.sh --restore backup_file.sql.gz"
        exit 1
    fi

    backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        log_error "备份文件不存在: $backup_file"
        exit 1
    fi

    log_info "从备份恢复数据库: $backup_file"

    if [[ $backup_file == *.gz ]]; then
        gunzip -c "$backup_file" | docker exec -i mall_mysql mysql \
            -u root \
            -p${MYSQL_ROOT_PASSWORD} \
            mall_db
    else
        docker exec -i mall_mysql mysql \
            -u root \
            -p${MYSQL_ROOT_PASSWORD} \
            mall_db < "$backup_file"
    fi

    log_success "数据库恢复完成"
}

# 清理资源
cleanup() {
    log_info "清理未使用的Docker资源..."

    docker system prune -f
    docker volume prune -f
    docker network prune -f

    log_success "清理完成"
}

# 显示帮助信息
show_help() {
    echo "商城Docker部署脚本"
    echo
    echo "使用方法: ./deploy.sh [选项]"
    echo
    echo "选项:"
    echo "  --init     首次部署，初始化所有服务"
    echo "  --update   更新应用"
    echo "  --stop     停止所有服务"
    echo "  --restart  重启所有服务"
    echo "  --logs     查看日志"
    echo "  --status   检查服务状态"
    echo "  --backup   备份数据库"
    echo "  --restore  恢复数据库 (需要指定备份文件)"
    echo "  --cleanup  清理Docker资源"
    echo "  --help     显示帮助信息"
    echo
    echo "示例:"
    echo "  ./deploy.sh --init"
    echo "  ./deploy.sh --update"
    echo "  ./deploy.sh --restore backups/mall_db_20231201_120000.sql.gz"
}

# 主函数
main() {
    case "${1:-}" in
        --init)
            init_deploy
            ;;
        --update)
            update_app
            ;;
        --stop)
            stop_services
            ;;
        --restart)
            restart_services
            ;;
        --logs)
            show_logs
            ;;
        --status)
            check_services
            ;;
        --backup)
            backup_database
            ;;
        --restore)
            restore_database "$2"
            ;;
        --cleanup)
            cleanup
            ;;
        --help|"")
            show_help
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"