<script setup>
import { inject } from "vue";
import useCounter from "@/composables/useCounter.js";


const { kurang, tambah, nilai} = useCounter();
</script>

<template>
  <main>
    <p >{{ nilai }}</p>
    <button @click="tambah">Tambah</button>
    <button @click="kurang">Kurang</button>
  </main>
</template>
