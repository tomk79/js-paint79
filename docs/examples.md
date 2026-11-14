# 使用例: ツールバー・レイヤーパネルと組み合わせる

本ライブラリはツールバーやレイヤーパネル等のボタン類を含みません。アプリケーション側で自由に UI を作成し、API を呼び出してください。

```html
<div>
  <button id="btn-pen">ペン</button>
  <button id="btn-eraser">消しゴム</button>
  <input id="color" type="color" value="#000000">
  <input id="width" type="range" min="1" max="50" value="4">
  <button id="btn-undo" disabled>元に戻す</button>
  <button id="btn-redo" disabled>やり直す</button>
  <button id="btn-save">保存</button>
  <input id="file-open" type="file" accept="image/png,image/jpeg,image/webp">
</div>
<div>
  <button id="btn-add-layer">レイヤーを追加</button>
  <ul id="layer-list"></ul>
</div>
<div id="paint-area" style="width: 100%; height: 480px;"></div>

<script type="module">
  import Paint79 from '@tomk79/paint79';

  const paint79 = new Paint79(document.getElementById('paint-area'), {
    palmRejection: true,
  });

  // ツール
  document.getElementById('btn-pen').addEventListener('click', () => paint79.setTool('pen'));
  document.getElementById('btn-eraser').addEventListener('click', () => paint79.setTool('eraser'));
  document.getElementById('color').addEventListener('input', (e) => paint79.setColor(e.target.value));
  document.getElementById('width').addEventListener('input', (e) => paint79.setLineWidth(Number(e.target.value)));

  // 履歴
  document.getElementById('btn-undo').addEventListener('click', () => paint79.undo());
  document.getElementById('btn-redo').addEventListener('click', () => paint79.redo());
  paint79.on('historychange', ({ canUndo, canRedo }) => {
    document.getElementById('btn-undo').disabled = !canUndo;
    document.getElementById('btn-redo').disabled = !canRedo;
  });

  // 保存: Paint79 PNG としてダウンロードする
  document.getElementById('btn-save').addEventListener('click', async () => {
    const blob = await paint79.exportPNG();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'paint.png';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // 開く: Paint79 PNG ならレイヤーを復元、それ以外は 1 枚のレイヤーとして読み込む
  document.getElementById('file-open').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await paint79.open(file);
    if (!result.restored && result.reason === 'image-modified') {
      alert('この画像は他のソフトで編集されたため、レイヤー情報を復元できませんでした。');
    }
  });

  // レイヤーパネル
  document.getElementById('btn-add-layer').addEventListener('click', () => {
    paint79.setActiveLayer(paint79.addLayer());
  });

  const renderLayerPanel = (layers, activeLayerId) => {
    const list = document.getElementById('layer-list');
    list.innerHTML = '';
    // 前面のレイヤーを上に表示する
    [...layers].reverse().forEach((layer) => {
      const li = document.createElement('li');
      li.textContent = layer.name;
      li.style.fontWeight = layer.id === activeLayerId ? 'bold' : 'normal';
      li.addEventListener('click', () => paint79.setActiveLayer(layer.id));

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = layer.visible;
      toggle.addEventListener('click', (e) => e.stopPropagation());
      toggle.addEventListener('change', () => {
        paint79.setLayerProperties(layer.id, { visible: toggle.checked });
      });
      li.prepend(toggle);

      list.appendChild(li);
    });
  };
  paint79.on('layerchange', ({ layers, activeLayerId }) => renderLayerPanel(layers, activeLayerId));
  renderLayerPanel(paint79.getLayers(), paint79.getActiveLayerId());
</script>
```

