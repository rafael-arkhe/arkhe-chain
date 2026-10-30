using Arkhe.Shmup.Core;
using UnityEngine;

namespace Arkhe.Shmup
{
    public sealed class RelativeDragController : MonoBehaviour
    {
        public Camera gameplayCamera;
        [Min(0)] public float verticalOffset = 1.8f;
        [Min(0)] public float sensitivity = 1;
        [Min(0)] public float maxSpeed = 12;
        [Min(0)] public float response = 18;
        public bool DashRequested { get; private set; }
        readonly RelativeDragState state = new RelativeDragState();
        Vector2 swipeStart;
        float swipeStarted;
        bool paused;
        const int MouseId = -1;

        void Start()
        {
            if (gameplayCamera == null) gameplayCamera = Camera.main;
            if (gameplayCamera == null || !gameplayCamera.orthographic)
            { enabled = false; Debug.LogError("Relative drag requires an orthographic camera."); return; }
            UpdateBounds(); state.Reset(transform.position.x, transform.position.y);
            Input.simulateMouseWithTouches = false;
        }

        void Update()
        {
            if (paused) return;
            state.Offset = verticalOffset; state.Sensitivity = sensitivity;
            state.Response = response; state.MaxSpeed = maxSpeed;
            UpdateBounds();
            bool found = false;
            for (int i = 0; i < Input.touchCount; i++)
            {
                var touch = Input.GetTouch(i);
                if (touch.phase == TouchPhase.Began && state.Pointer == int.MinValue)
                    Begin(touch.fingerId, touch.position);
                if (touch.fingerId != state.Pointer) continue;
                found = true;
                if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled) state.End(touch.fingerId);
                else Move(touch.fingerId, touch.position);
            }
            if (Input.touchCount == 0)
            {
                if (Input.GetMouseButtonDown(0)) Begin(MouseId, Input.mousePosition);
                if (state.Pointer == MouseId)
                {
                    found = Input.GetMouseButton(0);
                    if (found) Move(MouseId, Input.mousePosition); else state.End(MouseId);
                }
            }
            if (!found && state.Pointer != int.MinValue) state.Cancel();
            state.Step(transform.position.x, transform.position.y, Time.unscaledDeltaTime, out float x, out float y);
            transform.position = new Vector3(x, y, transform.position.z);
        }

        void Begin(int id, Vector2 screen)
        {
            if (!Screen.safeArea.Contains(screen) || !gameplayCamera.pixelRect.Contains(screen)) return;
            var world = ToWorld(screen);
            if (state.Begin(id, world.x, world.y))
            { swipeStart = screen; swipeStarted = Time.unscaledTime; }
        }

        void Move(int id, Vector2 screen)
        {
            var world = ToWorld(screen);
            if (!state.Move(id, world.x, world.y)) return;
            // Normalize threshold to 960px reference portrait height.
            float threshold = gameplayCamera.pixelHeight * 90f / 960f;
            if (swipeStart.y - screen.y >= threshold && Time.unscaledTime - swipeStarted <= 0.22f)
            { DashRequested = true; swipeStarted = float.NegativeInfinity; }
        }

        public bool ConsumeDash()
        { bool result = DashRequested; DashRequested = false; return result; }

        Vector3 ToWorld(Vector2 screen)
        {
            float depth = gameplayCamera.WorldToScreenPoint(transform.position).z;
            return gameplayCamera.ScreenToWorldPoint(new Vector3(screen.x, screen.y, depth));
        }

        void UpdateBounds()
        {
            Rect cameraRect = gameplayCamera.pixelRect;
            Rect safe = Screen.safeArea;
            var bottom = ToWorld(new Vector2(Mathf.Max(cameraRect.xMin, safe.xMin), Mathf.Max(cameraRect.yMin, safe.yMin)));
            var top = ToWorld(new Vector2(Mathf.Min(cameraRect.xMax, safe.xMax), Mathf.Min(cameraRect.yMax, safe.yMax)));
            const float margin = 0.25f;
            if (top.x - bottom.x > margin * 2 && top.y - bottom.y > margin * 2)
                state.Bounds(bottom.x + margin, bottom.y + margin, top.x - margin, top.y - margin);
        }

        void OnApplicationFocus(bool focused) { paused = !focused; state.Cancel(); DashRequested = false; }
        void OnApplicationPause(bool value) { paused = value; state.Cancel(); DashRequested = false; }
        void OnDisable() { state.Cancel(); DashRequested = false; }
    }
}
