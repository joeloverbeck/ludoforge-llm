# Fire in the Lake - Observability

```yaml
observability:
  observers:
    currentPlayer:
      description: "Standard FITL player perspective — most surfaces public"
      surfaces:
        perPlayerVars:
          _default: seatVisible
          resources:
            current: public
            preview:
              visibility: public
              allowWhenHiddenSampling: false
        victory:
          currentMargin:
            current: public
            preview:
              visibility: public
              allowWhenHiddenSampling: false
          currentRank:
            current: public
            preview:
              visibility: public
              allowWhenHiddenSampling: false
        activeCardIdentity:
          current: public
          preview:
            visibility: public
            allowWhenHiddenSampling: false
        activeCardTag:
          current: public
          preview:
            visibility: public
            allowWhenHiddenSampling: false
        activeCardMetadata:
          current: public
          preview:
            visibility: public
            allowWhenHiddenSampling: false
        activeCardAnnotation:
          current: public
          preview:
            visibility: public
            allowWhenHiddenSampling: false
```
