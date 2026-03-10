/**
 * Main workbench layout that displays plugin views and command launchers.
 */
import TopBar from '@/ui/layout/TopBar';
import Aside from './layout/Aside';
import { useMainViewStore } from '@/store/mainViewStore';
import MainContent from './layout/MainContent';
import { X } from 'lucide-react';

export default function WorkbenchLayout() {
    const viewContent = useMainViewStore(state => state.viewContent);
    const setViewContent = useMainViewStore(state => state.setViewContent);

    return (
        <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900">
            <TopBar />
            <div className="flex flex-1 min-h-0 overflow-hidden">
                <Aside />
                <div className="flex-1 relative"> {/* 外层设为 relative，不滚动 */}
                    <div className="absolute inset-0 overflow-auto">
                        <MainContent />
                        <MainContent />
                        <MainContent />
                    </div>
                    {/* 按钮锚定在外层容器的右上角，不随滚动移动 */}
                    {!!viewContent && <button
                        className="absolute top-2 right-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                        onClick={() => setViewContent(null)}
                    >
                        <X className="h-4 w-4" />
                    </button>}
                </div>
            </div>
        </div>
    );
}
