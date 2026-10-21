import { Route, Switch } from "wouter";
import NotFound from "./NotFoundPage";
import LandingPage from "./LandingPage";
import PortfolioBuilderPage from "./PortfolioBuilderPage";

export default function Routers() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/portfolio" component={PortfolioBuilderPage} />
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}
