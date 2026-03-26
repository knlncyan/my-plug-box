import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface MyTooltipProps {
    text: string,
    children: React.ReactNode,
}

export function MyTooltip({ text, children, ...restProps }: MyTooltipProps & Record<string, any>) {
    return (
        <Tooltip {...restProps}>
            <TooltipTrigger asChild>
                {children}
            </TooltipTrigger>
            <TooltipContent>
                <p>{text}</p>
            </TooltipContent>
        </Tooltip>
    )
}