import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { TraderDetail } from './pages/TraderDetail';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="trader/:address" element={<TraderDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
