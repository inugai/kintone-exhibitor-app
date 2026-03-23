import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { KintoneRestAPIClient } from '@kintone/rest-api-client';

// Kintoneクライアントの初期化
const client = new KintoneRestAPIClient({
  baseUrl: import.meta.env.VITE_KINTONE_BASE_URL,
  auth: { apiToken: [import.meta.env.VITE_KINTONE_API_TOKEN,import.meta.env.VITE_KINTONE_API_PLAN_TOKEN]}
});

function App() {
  const [status, setStatus] = useState('待機中');
  const [exhibitorId, setExhibitorId] = useState('');
  const [visitorName, setVisitorName] = useState('');

  useEffect(() => {
    // URLパラメータから出展者IDを取得 (?exh_id=Sony など)
    const params = new URLSearchParams(window.location.search);
    const id = params.get('exh_id');
    if (id) {
      setExhibitorId(id);
    } else {
      setStatus("エラー: 出展者IDが指定されていません");
    }
  }, []);

  const onScanSuccess = async (decodedText: string, scanner: any) => {
    if (!exhibitorId) return;
    
    // 二重読み込み防止のため一度停止
    await scanner.clear();
    setStatus("照合中...");

    try {
      // 1. 来場者情報の照合
      const planResp = await client.record.getRecords({
        app: import.meta.env.VITE_APP_ID_PLAN,
        query: `uuid = "${decodedText}" limit 1`
      });

      if (planResp.records.length === 0) {
        alert("無効なQRコードです");
        window.location.reload(); // 再起動
        return;
      }

      const name = planResp.records[0].氏名.value as string;
      setVisitorName(name);

      // 2. 訪問履歴アプリへの登録
      await client.record.addRecord({
        app: import.meta.env.VITE_APP_ID_BOOTH_LOG,
        record: {
          出展者ID: { value: exhibitorId },
          uuid: { value: decodedText },
          日時: { value: new Date().toISOString() }
        }
      });

      setStatus("✅ 登録完了");
      alert(`${name} 様の訪問を記録しました`);
      
      // 次のスキャンのためにリセット
      window.location.reload(); 

    } catch (err) {
      console.error(err);
      setStatus("❌ 通信エラー");
    }
  };

  const startScanner = () => {
    const scanner = new Html5QrcodeScanner('reader', { fps: 10, qrbox: 250, videoConstraints: { facingMode: "environment" } }, false);
    scanner.render(onScanSuccess, () => {});
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>ブース訪問記録 ({exhibitorId || '未設定'})</h2>
      
      {exhibitorId ? (
        <>
          <div id="reader" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}></div>
          <button onClick={startScanner} style={{ marginTop: '20px', padding: '15px 30px', fontSize: '1.2rem' }}>
            スキャン開始
          </button>
        </>
      ) : (
        <p style={{ color: 'red' }}>専用のURLからアクセスしてください</p>
      )}

      <div style={{ marginTop: '20px' }}>
        <p>ステータス: <strong>{status}</strong></p>
        {visitorName && <p>最終来場者: <strong>{visitorName} 様</strong></p>}
      </div>
    </div>
  );
}

export default App;