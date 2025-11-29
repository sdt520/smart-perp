import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { TraderDetail } from './pages/TraderDetail';
import { Favorites } from './pages/Favorites';
import { TokenFlow } from './pages/TokenFlow';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="trader/:address" element={<TraderDetail />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="flow" element={<TokenFlow />} />
      </Route>
    </Routes>
  );
}

export default App;
