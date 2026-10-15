import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { if (import.meta.env.DEV) console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="panel p-6 max-w-md flex flex-col gap-3">
          {/dynamically imported module|Loading chunk|Importing a module script/i.test(this.state.error.message) || !navigator.onLine ? <>
            <h1 className="text-3xl">This screen couldn't load</h1>
            <p className="text-mute">Check your internet connection, then reload. Your saved calls are safe.</p>
          </> : <>
            <h1 className="text-3xl">This screen crashed</h1>
            <p className="text-mute">Your saved calls are safe. Reload to continue. If it keeps happening, export a backup from Settings.</p>
          </>}
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
            <button className="btn btn-quiet" onClick={() => { this.setState({ error: null }); location.hash = "#/"; }}>Go home</button>
          </div>
        </div>
      </div>
    );
  }
}
