"""Performance metadata follows the detached launcher's ownership contract."""
from deeptutor.runtime import launcher


def test_ready_state_preserves_process_ids_and_service_timings(tmp_path):
    paths = launcher._detached_launcher_paths(tmp_path)
    launcher._write_detached_state(paths, {"token": "own", "pid": 42, "status": "starting"})
    metrics = {"backend_pid": 43, "frontend_pid": 44, "backend_ready_ms": 1200,
               "frontend_ready_ms": 300, "frontend_reused": False}
    launcher._mark_detached_ready(paths, token="own", frontend_url="http://localhost:3782",
                                  backend_port=8001, frontend_port=3782, performance=metrics)
    state = launcher._read_detached_state(paths)
    assert state["status"] == "ready"
    assert state["pid"] == 42
    assert state["performance"] == metrics


def test_foreign_launcher_cannot_replace_performance_metadata(tmp_path):
    paths = launcher._detached_launcher_paths(tmp_path)
    original = {"token": "other", "pid": 42, "status": "starting"}
    launcher._write_detached_state(paths, original)
    launcher._mark_detached_ready(paths, token="own", frontend_url="http://localhost:3782",
                                  backend_port=8001, frontend_port=3782,
                                  performance={"backend_pid": 999})
    assert launcher._read_detached_state(paths) == original
