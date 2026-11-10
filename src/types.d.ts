/// <reference types="vite/client" />

type WindowAction = 'state' | 'toggle-floating' | 'toggle-top' | 'minimize' | 'close';
interface DesktopState { floating: boolean; onTop: boolean; paused: boolean }
interface Window {
  intercom?: {
    windowAction(action: WindowAction): Promise<DesktopState>;
    onWindowState(callback: (state: DesktopState) => void): () => void;
  };
}
