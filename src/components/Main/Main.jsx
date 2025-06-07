// src/components/Main/Main.jsx
import React, { useEffect, useRef, useState } from 'react';
import '../../assets/scss/Main.scss';
import centers from '../../data/seoul_filtered_centroids.json';

const CERT_KEY = '3059da37325d0e6b01e0daee7c66dd46b73d4e43e2ff496993c0ce75b2ae6479';

// 위경도 간 Haversine 거리 계산 함수
const toRad = deg => (deg * Math.PI) / 180;
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // 지구 반경 (km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function Main() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [resultText, setResultText] = useState('');
  const [recommendList, setRecommendList] = useState([]); // 객체 배열

  // 행정동 이름 가나다순 정렬
  const sortedCenters = React.useMemo(
    () => [...centers].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    []
  );

  useEffect(() => {
    // Leaflet CSS 동적 로드
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Leaflet JS 동적 로드
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.onload = () => {
      const L = window.L;
      if (!mapInstanceRef.current) {
        const map = L.map(mapRef.current).setView([37.5665, 126.978], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        mapInstanceRef.current = map;

        // 공공 데이터 마커 추가
        fetch(
          `https://api.odcloud.kr/api/15012005/v1/centers?serviceKey=${CERT_KEY}&page=1&perPage=100`
        )
          .then(res => res.json())
          .then(json => {
            (json.data || []).forEach(item => {
              const lat = parseFloat(item.위도);
              const lng = parseFloat(item.경도);
              if (!isNaN(lat) && !isNaN(lng)) {
                L.marker([lat, lng]).addTo(map).bindPopup(item.상호명);
              }
            });
          })
          .catch(console.error);

        // 지도 클릭 시 가까운 행정동 이름 표시
        map.on('click', e => {
          const { lat, lng } = e.latlng;
          let nearest = { name: null, dist: Infinity };
          centers.forEach(d => {
            const dist = haversine(lat, lng, d.lat, d.lng);
            if (dist < nearest.dist) nearest = { name: d.name, dist };
          });
          L.marker([lat, lng])
            .addTo(map)
            .bindPopup(
              `위도: ${lat.toFixed(5)}, 경도: ${lng.toFixed(5)}<br/>행정동: ${nearest.name}`
            )
            .openPopup();
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.body.removeChild(script);
    };
  }, []);

  // 상권분석 및 추천 API 호출 핸들러
  const handleSearchAndAnalyze = async () => {
    if (!searchTerm) {
      alert('행정동을 선택해주세요.');
      return;
    }
    const map = mapInstanceRef.current;
    if (!map) return;

    // 선택한 행정동의 좌표 찾기
    const found = centers.find(d => d.name === searchTerm);
    if (!found) {
      alert(`"${searchTerm}" 행정동을 찾을 수 없습니다.`);
      return;
    }

    // 지도 뷰 이동
    map.setView([found.lat, found.lng], 15);

    // 기존 마커 제거
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    // 새 마커 추가
    const L = window.L;
    const newMarker = L.marker([found.lat, found.lng])
      .addTo(map)
      .bindPopup(`행정동: ${found.name}`)
      .openPopup();
    markersRef.current.push(newMarker);

    // 1) 분석 텍스트 가져오기
    try {
      const predictRes = await fetch(
        `https://swapi-j46r.onrender.com/predict?dong_name=${encodeURIComponent(
          searchTerm
        )}`
      );
      if (!predictRes.ok) throw new Error(`서버 오류: ${predictRes.status}`);
      const predictData = await predictRes.json();
      setResultText(predictData.result || '분석 결과가 없습니다.');
    } catch (error) {
      setResultText(`분석 중 오류가 발생했습니다: ${error.message}`);
    }

    // 2) Top-5 추천 상권 리스트 가져오기
    try {
      const recRes = await fetch(
        `https://swapi-j46r.onrender.com/recommend_sales?dong_name=${encodeURIComponent(
          searchTerm
        )}&top_n=5`
      );
      if (!recRes.ok) throw new Error(`추천 API 오류: ${recRes.status}`);
      const recJson = await recRes.json();
      // 객체 배열 그대로 저장
      setRecommendList(recJson['상등급_향후매출_추천'] || []);
    } catch (error) {
      console.error('추천 불러오기 실패:', error);
      setRecommendList([]);
    }
  };

  return (
    <div className="main-container">
      {/* 헤더 */}
      <header className="main-header">
        <div className="logo-image">
          <img src="/image/On_image.png" alt="상권온 로고" />
        </div>
        <div className="logo">상권온(ON)</div>
      </header>

      <div className="main-content">
        {/* 지역 선택 및 결과 */}
        <section className="location-select">
          <h2>지역을 선택하세요.</h2>
          <div className="dropdowns">
            <select
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            >
              <option value="">서울시</option>
              {sortedCenters.map((d, idx) => (
                <option key={`${d.name}-${idx}`} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            <button onClick={handleSearchAndAnalyze}>상권 분석하기</button>
          </div>
          <div className="region-list" style={{ whiteSpace: 'pre-wrap' }}>
            {resultText ||
              '선택한 행정동의 상권분석 결과가 여기 표시됩니다.'}
          </div>
        </section>

        {/* 지도 및 추천 상권 */}
        <section className="map-section">
          <div className="map-container">
            <div id="map" ref={mapRef} style={{ height: '400px' }} />
          </div>
          <div className="region-summary">
            <h3>이런 상권은 어때요?</h3>
            {recommendList.length > 0 ? (
              <ul>
                {recommendList.map((item, idx) => (
                  <li key={idx}>
                    {item.행정동} — 평균 향후 매출: {item['평균 향후 매출']}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                추천 상권을 불러오는 중이거나, 아직 분석을 실행하지 않았습니다.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
