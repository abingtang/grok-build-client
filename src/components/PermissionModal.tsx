import type { PermissionRequest } from "../lib/types";

interface Props {
  request: PermissionRequest;
  onRespond: (optionId: string) => void;
}

export function PermissionModal({ request, onRespond }: Props) {
  return (
    <div className="overlay">
      <div className="modal">
        <header>
          <h3>需要批准工具执行</h3>
        </header>
        <div className="body">
          <strong>{request.title}</strong>
          {request.description ? `\n\n${request.description}` : ""}
          {"\n\n"}
          <span style={{ opacity: 0.7, fontSize: 12 }}>
            requestId: {request.requestId}
          </span>
        </div>
        <div className="permission-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onRespond("allow-once")}
          >
            允许一次
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onRespond("allow-always")}
          >
            始终允许
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onRespond("reject")}
          >
            拒绝
          </button>
        </div>
      </div>
    </div>
  );
}
