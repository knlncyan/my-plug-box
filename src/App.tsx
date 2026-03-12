import '@/lib/lifecycle/index'
import { Toaster } from './components/ui/sonner';
import WorkbenchLayout from './ui';
import lifecycleTrigger from './lib/lifecycleTrigger';


export default function App() {
  lifecycleTrigger.startInit();

  return (
    <>
      <WorkbenchLayout />
      <Toaster />
    </>
  )
};
