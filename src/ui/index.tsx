/**
 * Main workbench layout that displays plugin views and command launchers.
 */
import TopBar from '@/ui/layout/TopBar';
import Aside from './layout/Aside';
import MainContent from './layout/MainContent';
import CommandPalette from './pages/commandPalette';

export default function WorkbenchLayout() {

    return (
        <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900">
            <TopBar />
            <div className="flex flex-1 min-h-0 overflow-hidden">
                <Aside />
                <div className="flex-1 relative"> {/* 外层设为 relative，不滚动 */}
                    <div className="absolute inset-0 overflow-auto">
                        <MainContent />
                    </div>
                </div>
            </div>
            {/* 这里放全局的Dialog，让它们能被扫描到 */}
            <CommandPalette />
        </div>
    );
}
