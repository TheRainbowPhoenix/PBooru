<script>
  export let disabled = false;
  export let text = "";
  export let type = "button";
</script>

<button class="primary" {type} disabled={disabled} {...$$restProps}>
  {text}
</button>
