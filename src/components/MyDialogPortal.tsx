// MyDialogPortal.tsx
import { createPortal } from "react-dom";
import { ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface MyDialogPortalProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    overlayProps?: HTMLAttributes<HTMLDivElement>;
    contentProps?: HTMLAttributes<HTMLDivElement>;
}

export function MyDialogPortal(props: MyDialogPortalProps) {
    if (!props.open) return null;
    const { onClose, children, overlayProps, contentProps } = props;
    const { className: overlayClassName, ...restOverlayProps } = overlayProps || {};
    const { className: contentClassName, ...restContentProps } = contentProps || {};

    return createPortal(
        <>
            <div
                className={cn("fixed inset-0 z-40 bg-black/20", overlayClassName)}
                onClick={onClose}
                aria-hidden="true"
                {...restOverlayProps}
            />

            {/* 2. 内容层 (Content) - 必须是遮罩的兄弟节点，而不是子节点！ */}
            <div
                className={cn("fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50", contentClassName)}
                role="dialog" // 重要：告诉屏幕阅读器这是一个对话框
                aria-modal="true" // 重要：表示这是一个模态窗口，背景内容暂时不可交互
                {...restContentProps}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </>,
        document.body
    );
}