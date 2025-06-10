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
  const [recommendData, setRecommendData] = useState(null);

  // 행정동 이름 가나다순 정렬
  const sortedCenters = React.useMemo(
    () => [...centers].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    []
  );

  // 지도 초기화 및 클릭 핸들러 설정
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.onload = () => {
      const L = window.L;
      if (!mapInstanceRef.current && mapRef.current) {
        const map = L.map(mapRef.current).setView([37.5665, 126.978], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        mapInstanceRef.current = map;

        // 공공데이터 마커
        fetch(
          `https://api.odcloud.kr/api/15012005/v1/centers?serviceKey=${CERT_KEY}&page=1&perPage=100`
        )
          .then(res => res.json())
          .then(json => {
            (json.data || []).forEach(item => {
              const lat = parseFloat(item.위도);
              const lng = parseFloat(item.경도);
              if (!isNaN(lat) && !isNaN(lng)) {
                L.marker([lat, lng])
                  .addTo(map)
                  .bindPopup(item.상호명);
              }
            });
          })
          .catch(console.error);

        // 클릭 시 근처 행정동 표시
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
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.head.removeChild(script);
    };
  }, []);

  // 검색 및 분석 실행
  const handleSearchAndAnalyze = async () => {
    if (!searchTerm) return alert('행정동을 선택해주세요.');
    const map = mapInstanceRef.current;
    if (!map) return;

    // 선택한 행정동으로 뷰 이동
    const found = centers.find(d => d.name === searchTerm);
    if (!found) return alert(`${searchTerm} 행정동을 찾을 수 없습니다.`);
    map.setView([found.lat, found.lng], 15);

    // 이전 마커 제거
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    // 선택 지점 마커
    const L = window.L;
    const marker = L.marker([found.lat, found.lng])
      .addTo(map)
      .bindPopup(found.name)
      .openPopup();
    markersRef.current.push(marker);

    // 1) 상권 분석 결과 가져오기
    try {
      const res = await fetch(
        `https://swapi-j46r.onrender.com/predict?dong_name=${encodeURIComponent(
          searchTerm
        )}`
      );
      if (!res.ok) throw new Error(res.status);
      const { result } = await res.json();
      setResultText(result);
    } catch (e) {
      setResultText(`분석 오류: ${e.message}`);
    }

    // 2) 추천 결과 전체 객체 가져오기
    try {
      const res = await fetch(
        `https://swapi-j46r.onrender.com/recommend/all?dong_name=${encodeURIComponent(
          searchTerm
        )}&top_n=5`
      );
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setRecommendData(data);
    } catch (e) {
      console.error('추천 불러오기 실패:', e);
      setRecommendData(null);
    }
  };

  return (
    <div className="main-container">
      <header className="main-header">
        <div className="logo-image">
          <img src="/image/On_image.png" alt="상권온 로고" />
        </div>
        <div className="logo">상권온(ON)</div>
      </header>

      <div className="main-content">
        {/* 지역 선택 & 분석 */}
        <section className="location-select">
          <h2>지역을 선택하세요.</h2>
          <div className="dropdowns">
            <select
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            >
              <option value="">서울시</option>
              {sortedCenters.map((d, idx) => (
                <option key={idx} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            <button onClick={handleSearchAndAnalyze}>
              상권 분석하기
            </button>
          </div>
          <div
            className="region-list"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {resultText ||
              '선택한 행정동의 상권분석 결과가 여기 표시됩니다.'}
          </div>
        </section>

        {/* 지도 및 추천 */}
        <section className="map-section">
          <div className="map-container">
            <div
              id="map"
              ref={mapRef}
              style={{ height: '400px' }}
            />
          </div>

          <div className="region-summary">
            <h3>이런 상권은 어때요?</h3>

            {!recommendData ? (
              <p>
                추천 상권을 불러오는 중이거나, 아직 분석을
                실행하지 않았습니다.
              </p>
            ) : (
              <>
                <p>기준: {recommendData.추천_기준}</p>

                <div className="recommend-container">
                  {recommendData.추천_기준 === '하등급' && (
                    <>
                      <div className="recommend-category">
                        <h4>폐업 위험 Top 5</h4>
                        <ul>
                          {recommendData.폐업위험_상위.map((it, i) => (
                            <li key={i}>
                              {it.행정동} — {it['평균 영업 개월']}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="recommend-category">
                        <h4>소득 낮은 Top 5</h4>
                        <ul>
                          {recommendData.소득낮은_상위.map((it, i) => (
                            <li key={i}>
                              {it.행정동} — {it['평균 소득']}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="recommend-category">
                        <h4>매출 낮은 Top 5</h4>
                        <ul>
                          {recommendData.매출낮은_상위.map((it, i) => (
                            <li key={i}>
                              {it.행정동} — {it['평균 매출']}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  {recommendData.추천_기준 === '중등급' && (
                    <>
                      <div className="recommend-category">
                        <h4>매출 증가율 Top 5</h4>
                        <ul>
                          {recommendData.매출증가_상위.map((it, i) => (
                            <li key={i}>
                              {it.행정동} — {it['평균 매출 증가율']}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="recommend-category">
                        <h4>유동인구 증가율 Top 5</h4>
                        <ul>
                          {recommendData.유동인구증가_상위.map((it, i) => (
                            <li key={i}>
                              {it.행정동} — {it['평균 유동인구 증가율']}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  {recommendData.추천_기준 === '상등급' && (
                    <>
                      <div className="recommend-category">
                        <h4>향후 매출 Top 5</h4>
                        <ul>
                          {recommendData.향후매출_상위.map((it, i) => (
                            <li key={i}>
                              {it.행정동} — {it['평균 향후 매출']}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="recommend-category">
                        <h4>피크 유동인구 Top 5</h4>
                        <ul>
                          {recommendData.피크유동인구_상위.map((it, i) => (
                            <li key={i}>
                              {it.행정동} — {it.건수}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="recommend-category">
                        <h4>상등급 비율 Top 5</h4>
                        <ul>
                          {recommendData.상등급_비율_상위.map((it, i) => (
                            <li key={i}>
                              {it.행정동} — {it['비율(%)']} ({it['데이터 건수']}건)
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
