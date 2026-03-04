import type { ViewMeta } from '../domain/protocol/plugin-catalog.protocol';

/**
 * 视图状态服务：
 * 1) 管理已注册视图目录。
 * 2) 管理当前 activeViewId 并执行有效性校验。
 */
export class PluginViewService {
  private views: ViewMeta[] = [];
  private activeViewId: string | null = null;

  setViews(views: ViewMeta[]): void {
    this.views = views;

    // 当当前激活视图不存在时，自动回退到第一个可用视图。
    if (this.activeViewId && !this.hasView(this.activeViewId)) {
      this.activeViewId = this.views[0]?.id ?? null;
    }

    if (!this.activeViewId) {
      this.activeViewId = this.views[0]?.id ?? null;
    }
  }

  getViews(): ViewMeta[] {
    return this.views;
  }

  getActiveViewId(): string | null {
    return this.activeViewId;
  }

  hasView(viewId: string): boolean {
    return this.views.some((view) => view.id === viewId);
  }

  setActiveView(viewId: string | null): boolean {
    if (viewId === null) {
      this.activeViewId = null;
      return true;
    }

    if (!this.hasView(viewId)) {
      return false;
    }

    this.activeViewId = viewId;
    return true;
  }
}
