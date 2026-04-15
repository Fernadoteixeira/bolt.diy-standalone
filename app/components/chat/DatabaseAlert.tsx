import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useDatabaseConnection } from '~/lib/hooks/useDatabaseConnection';
import type { DatabaseAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';

interface Props {
  alert: DatabaseAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

function cleanSqlContent(content: string) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(--).*$/gm, '')
    .replace(/(#).*$/gm, '')
    .trim();
}

export function DatabaseChatAlert({ alert, clearAlert, postMessage }: Props) {
  const { connection, isConnected } = useDatabaseConnection();
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleConnectClick = () => {
    document.dispatchEvent(new CustomEvent('open-database-connection'));
  };

  const executeDatabaseAction = async (sql: string) => {
    setIsExecuting(true);

    try {
      const response = await fetch(connection.routes.query, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });

      const data = (await response.json()) as { result?: unknown; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Database query failed');
      }

      clearAlert();
    } catch (error) {
      postMessage(
        `*Error executing PostgreSQL query. Please fix the SQL and return it again.*\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\`\n`,
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const title = isConnected ? 'PostgreSQL Query' : 'PostgreSQL Service Required';

  const message = isConnected
    ? 'Review the SQL below and apply it to the local PostgreSQL service.'
    : 'Start the local PostgreSQL stack or refresh the service state before running this query.';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-chat rounded-lg border-l-2 border-l-violet-500 border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
      >
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="i-ph:database text-violet-400 text-lg" />
            <h3 className="text-sm font-medium text-violet-300">{title}</h3>
          </div>
        </div>

        <div className="px-4">
          {!isConnected ? (
            <div className="p-3 rounded-md bg-bolt-elements-background-depth-3 text-sm text-bolt-elements-textPrimary">
              The local PostgreSQL stack is not currently reachable.
            </div>
          ) : (
            <>
              <div
                className="flex items-center p-2 rounded-md bg-bolt-elements-background-depth-3 cursor-pointer"
                onClick={() => setIsCollapsed((current) => !current)}
              >
                <div className="i-ph:sql text-bolt-elements-textPrimary mr-2"></div>
                <span className="text-sm text-bolt-elements-textPrimary flex-grow">
                  {alert.description || 'Execute database query'}
                </span>
                <div
                  className={`i-ph:caret-up text-bolt-elements-textPrimary transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                ></div>
              </div>

              {!isCollapsed && alert.content && (
                <div className="mt-2 p-3 bg-bolt-elements-background-depth-4 rounded-md overflow-auto max-h-60 font-mono text-xs text-bolt-elements-textSecondary">
                  <pre>{cleanSqlContent(alert.content)}</pre>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4">
          <p className="text-sm text-bolt-elements-textSecondary mb-4">{message}</p>

          <div className="flex gap-2">
            {!isConnected ? (
              <button
                onClick={handleConnectClick}
                className={classNames(
                  'px-3 py-2 rounded-md text-sm font-medium text-white flex items-center gap-1.5',
                  'bg-violet-500 hover:bg-violet-400',
                )}
              >
                Open database status
              </button>
            ) : (
              <button
                onClick={() => executeDatabaseAction(alert.content)}
                disabled={isExecuting}
                className={classNames(
                  'px-3 py-2 rounded-md text-sm font-medium text-white flex items-center gap-1.5',
                  'bg-violet-500 hover:bg-violet-400',
                  isExecuting ? 'opacity-70 cursor-not-allowed' : '',
                )}
              >
                {isExecuting ? 'Applying…' : 'Apply changes'}
              </button>
            )}

            <button
              onClick={clearAlert}
              disabled={isExecuting}
              className={classNames(
                'px-3 py-2 rounded-md text-sm font-medium bg-[#503B26] hover:bg-[#774f28] text-[#F79007]',
                isExecuting ? 'opacity-70 cursor-not-allowed' : '',
              )}
            >
              Dismiss
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
